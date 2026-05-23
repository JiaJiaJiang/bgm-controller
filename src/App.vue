<script setup>
import { ref, reactive, watch, onMounted, computed, onUnmounted } from 'vue'
import TopBar from './components/TopBar.vue'
import SceneList from './components/SceneList.vue'
import SceneEditor from './components/SceneEditor.vue'
import HelpDialog from './components/HelpDialog.vue'
import * as audioEngine from './stores/audioEngine.js'
import { saveToStorage, getInitialConfig, exportConfig, importConfig } from './stores/configManager.js'
import { DEFAULT_CONFIG, createScene } from './stores/config.js'

// 配置数据
const config = reactive({
  scenes: [],
  currentSceneIndex: -1,
  currentAudioIndex: -1,
  globalVolume: 80,
  isPlaying: false
})

// 预加载进度
const preloadProgress = ref({ loaded: 0, total: 0 })

// 加载失败列表
const loadErrors = ref([])
const showLoadErrors = ref(false)

// 编辑器覆盖层状态
const showEditor = ref(false)
const editingSceneIndex = ref(-1)
const editingScene = computed(() => {
  if (editingSceneIndex.value >= 0 && editingSceneIndex.value < config.scenes.length) {
    return config.scenes[editingSceneIndex.value]
  }
  return null
})

// 帮助弹窗
const showHelp = ref(false)

// 音频选择器（快捷键 a 触发）
const showAudioPicker = ref(false)
watch(showAudioPicker, (val) => {
  if (val) {
    // 延迟重置，让 SceneList 有机会处理
    setTimeout(() => { showAudioPicker.value = false }, 100)
  }
})

// 初始化
onMounted(async () => {
  const initialConfig = await getInitialConfig()
  // 修正重复的场景编号
  fixDuplicateOrders(initialConfig.scenes)
  Object.assign(config, initialConfig)
  audioEngine.setGlobalVolume(config.globalVolume)

  if (config.scenes.length > 0) {
    startPreload()
    if (config.currentSceneIndex < 0) {
      config.currentSceneIndex = 0
    }
    if (config.currentAudioIndex < 0 && config.scenes[config.currentSceneIndex]?.audios.length > 0) {
      config.currentAudioIndex = 0
    }
  }
})

// 键盘快捷键
function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return

  switch (e.key) {
    case ' ':
      e.preventDefault()
      if (config.scenes.length > 0 && config.currentSceneIndex >= 0) {
        const scene = config.scenes[config.currentSceneIndex]
        if (scene && scene.audios.length > 0) {
          config.isPlaying = !config.isPlaying
        }
      }
      break
    case '[':
      prevAudio()
      break
    case ']':
      nextAudio()
      break
    case 'a':
      if (config.currentSceneIndex >= 0) {
        showAudioPicker.value = true
      }
      break
    case '=':
    case '+':
      e.preventDefault()
      config.globalVolume = Math.min(100, config.globalVolume + 5)
      audioEngine.setGlobalVolume(config.globalVolume)
      break
    case '-':
      e.preventDefault()
      config.globalVolume = Math.max(0, config.globalVolume - 5)
      audioEngine.setGlobalVolume(config.globalVolume)
      break
    default:
      const num = parseInt(e.key)
      if (num >= 0 && num <= 9) {
        const idx = config.scenes.findIndex(s => s.order === num)
        if (idx >= 0) {
          handlePlayScene(idx)
        }
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 修正重复的场景编号
function fixDuplicateOrders(scenes) {
  const usedOrders = new Set()
  for (const scene of scenes) {
    let order = scene.order
    while (usedOrders.has(order)) {
      order++
    }
    if (order !== scene.order) {
      scene.order = order
    }
    usedOrders.add(order)
  }
}

// 获取保存用的配置（排除运行时状态）
function getSaveConfig() {
  return {
    ...config,
    isPlaying: false
  }
}

// 自动保存到 localStorage
watch(config, () => {
  saveToStorage(getSaveConfig())
}, { deep: true })

// 预加载所有音频
async function startPreload() {
  preloadProgress.value = { loaded: 0, total: 0 }
  loadErrors.value = []
  const seen = new Set()
  await audioEngine.preloadAllAudios(config.scenes,
    (loaded, total) => {
      preloadProgress.value = { loaded, total }
    },
    (url, sceneName, reason, suggestion) => {
      if (!seen.has(url)) {
        seen.add(url)
        loadErrors.value.push({ url, sceneName, reason, suggestion })
      }
    }
  )
  // 预加载完成后如果有错误则弹窗
  if (loadErrors.value.length > 0) {
    showLoadErrors.value = true
  }
}

// 播放当前选中的音频
function doPlay() {
  const scene = config.scenes[config.currentSceneIndex]
  if (!scene) return false

  const audioConfig = scene.audios[config.currentAudioIndex]
  if (!audioConfig || !audioConfig.src) return false

  const si = config.currentSceneIndex
  const ai = config.currentAudioIndex
  const cached = audioEngine.getCachedAudio(audioConfig.src, si, ai)
  if (!cached) {
    audioEngine.preloadAudio(audioConfig.src, si, ai, scene).then(() => {
      audioEngine.playSceneAudio(si, ai, audioConfig, scene)
    }).catch(err => {
      console.error('播放失败:', err)
      const sceneName = scene.name || '未命名场景'
      const reason = audioEngine.getErrorReason ? audioEngine.getErrorReason(err) : (err.message || '未知错误')
      const suggestion = audioEngine.getErrorSuggestion ? audioEngine.getErrorSuggestion(err) : ''
      if (!loadErrors.value.some(e => e.url === audioConfig.src)) {
        loadErrors.value.push({ url: audioConfig.src, sceneName, reason, suggestion })
      }
      showLoadErrors.value = true
    })
    return true
  }

  audioEngine.playSceneAudio(si, ai, audioConfig, scene)
  return true
}

// 开始播放
function startPlay() {
  if (!config.isPlaying) {
    // 停止状态：设置 isPlaying 由 watch 触发播放
    config.isPlaying = true
  } else {
    // 播放中：直接调用 doPlay 切换音频
    doPlay()
  }
}

// 停止播放
function stopPlay() {
  config.isPlaying = false
  audioEngine.stop()
}

// 获取按 order 排序后的场景索引列表
function getSortedSceneIndices() {
  return config.scenes
    .map((scene, index) => ({ index, order: scene.order }))
    .sort((a, b) => a.order - b.order)
    .map(item => item.index)
}

// 上一个场景（按 order 排序顺序）
function prevScene() {
  if (config.scenes.length === 0) return
  const sorted = getSortedSceneIndices()
  const currentPos = sorted.indexOf(config.currentSceneIndex)
  const prevPos = currentPos - 1
  if (prevPos < 0) return
  config.currentSceneIndex = sorted[prevPos]
  config.currentAudioIndex = 0
  if (config.isPlaying) {
    startPlay()
  }
}

// 下一个场景（按 order 排序顺序）
function nextScene() {
  if (config.scenes.length === 0) return
  const sorted = getSortedSceneIndices()
  const currentPos = sorted.indexOf(config.currentSceneIndex)
  const nextPos = currentPos + 1
  if (nextPos >= sorted.length) return
  config.currentSceneIndex = sorted[nextPos]
  config.currentAudioIndex = 0
  if (config.isPlaying) {
    startPlay()
  }
}

// 获取下一个可用的音频索引（跳过加载失败的）
function getNextValidAudioIndex(scene, currentIdx, direction) {
  const len = scene.audios.length
  if (len === 0) return -1
  let idx = currentIdx
  let attempts = 0
  while (attempts < len) {
    idx = (idx + direction + len) % len
    if (!audioEngine.isAudioFailed(config.currentSceneIndex, idx)) {
      return idx
    }
    attempts++
  }
  return -1 // 所有音频都失败了
}

// 上一个音频（在当前场景内，跳过加载失败的）
function prevAudio() {
  const scene = config.scenes[config.currentSceneIndex]
  if (!scene || scene.audios.length === 0) return

  const idx = getNextValidAudioIndex(scene, config.currentAudioIndex, -1)
  if (idx < 0) return
  config.currentAudioIndex = idx
  startPlay()
}

// 下一个音频（在当前场景内，跳过加载失败的）
function nextAudio() {
  const scene = config.scenes[config.currentSceneIndex]
  if (!scene || scene.audios.length === 0) return

  const idx = getNextValidAudioIndex(scene, config.currentAudioIndex, 1)
  if (idx < 0) return
  config.currentAudioIndex = idx
  startPlay()
}

// 选择指定音频（从场景卡片选曲按钮调用）
function selectAudio(audioIndex) {
  const scene = config.scenes[config.currentSceneIndex]
  if (!scene || audioIndex < 0 || audioIndex >= scene.audios.length) return

  config.currentAudioIndex = audioIndex
  startPlay()
}

// 音频播放结束后的自动行为（由切换模式控制）
function handleAudioEnded() {
  if (config.scenes.length === 0) return

  const scene = config.scenes[config.currentSceneIndex]
  if (!scene || scene.audios.length === 0) return

  const mode = scene.mode

  switch (mode) {
    case 'single-play':
      stopPlay()
      break

    case 'single-loop':
      doPlay()
      break

    case 'sequential': {
      let nextIdx = config.currentAudioIndex + 1
      if (nextIdx >= scene.audios.length) {
        stopPlay()
      } else {
        config.currentAudioIndex = nextIdx
        doPlay()
      }
      break
    }

    case 'sequential-loop': {
      let nextIdx = config.currentAudioIndex + 1
      if (nextIdx >= scene.audios.length) {
        nextIdx = 0
      }
      config.currentAudioIndex = nextIdx
      doPlay()
      break
    }

    case 'random-loop': {
      const nextIdx = Math.floor(Math.random() * scene.audios.length)
      config.currentAudioIndex = nextIdx
      doPlay()
      break
    }
  }
}

// 监听播放状态变化
watch(() => config.isPlaying, (playing) => {
  if (playing) {
    const state = audioEngine.getPlayState()
    if (state.isPaused) {
      audioEngine.resume()
    } else {
      doPlay()
    }
  } else {
    audioEngine.pause()
  }
})

// 新建配置（二次确认）
function handleNewConfig() {
  if (config.scenes.length > 0) {
    const confirmed = confirm('确定要新建配置吗？当前配置将被清除。')
    if (!confirmed) return
  }
  audioEngine.stop()
  audioEngine.clearCache()
  Object.assign(config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)))
  showEditor.value = false
  editingSceneIndex.value = -1
  saveToStorage(getSaveConfig())
}

// 导入配置
async function handleImport() {
  const imported = await importConfig()
  if (!imported) return

  audioEngine.stop()
  audioEngine.clearCache()
  // 修正重复的场景编号
  fixDuplicateOrders(imported.scenes)
  Object.assign(config, imported)
  config.isPlaying = false
  showEditor.value = false
  editingSceneIndex.value = -1
  saveToStorage(getSaveConfig())

  if (config.scenes.length > 0) {
    startPreload()
  }
}

// 导出配置
function handleExport() {
  exportConfig(getSaveConfig())
}

// 点击场景播放（跳过加载失败的音频）
function handlePlayScene(index) {
  if (index < 0 || index >= config.scenes.length) return
  const scene = config.scenes[index]
  if (scene.audios.length === 0) return

  config.currentSceneIndex = index
  // 找到第一个可用的音频（跳过加载失败的）
  let firstValid = -1
  for (let i = 0; i < scene.audios.length; i++) {
    if (!audioEngine.isAudioFailed(index, i)) {
      firstValid = i
      break
    }
  }
  if (firstValid < 0) return // 所有音频都失败

  if (scene.mode === 'random-loop') {
    // 随机循环：从可用音频中随机选
    const validIndices = []
    for (let i = 0; i < scene.audios.length; i++) {
      if (!audioEngine.isAudioFailed(index, i)) {
        validIndices.push(i)
      }
    }
    config.currentAudioIndex = validIndices[Math.floor(Math.random() * validIndices.length)]
  } else {
    config.currentAudioIndex = firstValid
  }
  startPlay()
}

// 打开场景编辑器
function handleEditScene(index) {
  editingSceneIndex.value = index
  showEditor.value = true
}

// 关闭场景编辑器
function handleCloseEditor() {
  showEditor.value = false
  editingSceneIndex.value = -1
}

// 更新场景（同时修正重复编号和音频索引）
function handleUpdateScene(updatedScene) {
  if (editingSceneIndex.value >= 0) {
    const oldScene = config.scenes[editingSceneIndex.value]
    config.scenes[editingSceneIndex.value] = updatedScene
    // 修正所有场景的重复编号
    fixDuplicateOrders(config.scenes)

    // 如果编辑的是当前播放的场景，修正 currentAudioIndex
    if (editingSceneIndex.value === config.currentSceneIndex) {
      const oldAudioId = oldScene.audios[config.currentAudioIndex]?.id
      if (oldAudioId) {
        // 在更新后的音频数组中查找相同 ID 的音频
        const newIdx = updatedScene.audios.findIndex(a => a.id === oldAudioId)
        if (newIdx >= 0) {
          config.currentAudioIndex = newIdx
        } else if (updatedScene.audios.length > 0) {
          // 音频被删除了，重置到第一个
          config.currentAudioIndex = 0
        } else {
          config.currentAudioIndex = -1
        }
      }
    }
  }
}

// 添加场景
function handleAddScene() {
  const newScene = createScene()
  config.scenes.push(newScene)
  // 修正编号
  fixDuplicateOrders(config.scenes)
}

// 删除场景
function handleDeleteScene(index) {
  if (!confirm(`确定要删除场景"${config.scenes[index]?.name || '未命名'}"吗？`)) return

  config.scenes.splice(index, 1)
  if (config.currentSceneIndex === index) {
    config.currentSceneIndex = -1
    config.currentAudioIndex = -1
    audioEngine.stop()
  } else if (config.currentSceneIndex > index) {
    config.currentSceneIndex--
  }
  if (editingSceneIndex.value === index) {
    showEditor.value = false
    editingSceneIndex.value = -1
  } else if (editingSceneIndex.value > index) {
    editingSceneIndex.value--
  }
}

// 移动场景顺序
function handleMoveSceneUp(index) {
  if (index <= 0) return
  ;[config.scenes[index], config.scenes[index - 1]] = [config.scenes[index - 1], config.scenes[index]]
  const tempOrder = config.scenes[index].order
  config.scenes[index].order = config.scenes[index - 1].order
  config.scenes[index - 1].order = tempOrder
  // 更新当前场景索引
  if (config.currentSceneIndex === index) {
    config.currentSceneIndex = index - 1
  } else if (config.currentSceneIndex === index - 1) {
    config.currentSceneIndex = index
  }
}

function handleMoveSceneDown(index) {
  if (index >= config.scenes.length - 1) return
  ;[config.scenes[index], config.scenes[index + 1]] = [config.scenes[index + 1], config.scenes[index]]
  const tempOrder = config.scenes[index].order
  config.scenes[index].order = config.scenes[index + 1].order
  config.scenes[index + 1].order = tempOrder
  // 更新当前场景索引
  if (config.currentSceneIndex === index) {
    config.currentSceneIndex = index + 1
  } else if (config.currentSceneIndex === index + 1) {
    config.currentSceneIndex = index
  }
}
</script>

<template>
  <div id="app-container">
    <!-- 固定顶端 -->
    <TopBar
      :config="config"
      :preload-progress="preloadProgress"
      @update:config="Object.assign(config, $event)"
      @prev-scene="prevScene"
      @next-scene="nextScene"
      @prev-audio="prevAudio"
      @next-audio="nextAudio"
      @audio-ended="handleAudioEnded"
      @select-scene="handlePlayScene"
      @new-config="handleNewConfig"
      @import-config="handleImport"
      @export-config="handleExport"
      @show-help="showHelp = true"
    />

    <!-- 场景列表（紧跟在 TopBar 下方） -->
    <SceneList
      :config="config"
      :show-audio-picker="showAudioPicker"
      @play-scene="handlePlayScene"
      @edit-scene="handleEditScene"
      @select-audio="selectAudio"
      @add-scene="handleAddScene"
      @delete-scene="handleDeleteScene"
      @move-scene-up="handleMoveSceneUp"
      @move-scene-down="handleMoveSceneDown"
    />

    <!-- 场景编辑器覆盖层 -->
    <SceneEditor
      v-if="showEditor && editingScene"
      :scene="editingScene"
      :scene-index="editingSceneIndex"
      @update:scene="handleUpdateScene"
      @close="handleCloseEditor"
    />

    <!-- 帮助弹窗 -->
    <HelpDialog
      v-if="showHelp"
      @close="showHelp = false"
    />

    <!-- 加载错误弹窗 -->
    <div v-if="showLoadErrors && loadErrors.length > 0" class="error-overlay" @click="showLoadErrors = false">
      <div class="error-dialog" @click.stop>
        <div class="error-header">
          <h3>音频加载失败</h3>
          <button @click="showLoadErrors = false" class="error-close">×</button>
        </div>
        <div class="error-body">
          <p>以下音频文件加载失败：</p>
          <div v-for="(err, idx) in loadErrors" :key="idx" class="error-item">
            <span class="error-scene">[{{ err.sceneName }}]</span>
            <span class="error-url" :title="err.url">{{ err.url }}</span>
            <span v-if="err.reason" class="error-reason">{{ err.reason }}</span>
            <span
              v-if="err.suggestion"
              class="error-help"
              :title="err.suggestion"
            >?</span>
          </div>
        </div>
        <div class="error-footer">
          <button @click="showLoadErrors = false">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 加载错误弹窗 */
.error-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-dialog {
  background: var(--bg);
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.error-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.error-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-h);
}

.error-close {
  font-size: 20px;
  padding: 0 6px;
  line-height: 1;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.error-close:hover {
  color: var(--text-h);
}

.error-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
}

.error-body p {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text);
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.error-item:last-child {
  border-bottom: none;
}

.error-scene {
  color: #e74c3c;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.error-url {
  color: var(--text);
  word-break: break-all;
  font-family: var(--mono);
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

.error-reason {
  color: var(--text);
  font-size: 12px;
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
}

.error-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
  border: 1px solid var(--accent-border);
}

.error-help:hover {
  background: var(--accent);
  color: var(--bg);
}

.error-footer {
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}
</style>
