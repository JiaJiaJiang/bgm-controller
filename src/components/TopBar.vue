<script setup>
import { ref, computed, watch } from 'vue'
import { PLAY_MODES } from '../stores/config.js'
import * as audioEngine from '../stores/audioEngine.js'

const props = defineProps({
  config: { type: Object, required: true },
  preloadProgress: { type: Object, default: () => ({ loaded: 0, total: 0 }) }
})

const emit = defineEmits([
  'update:config',
  'prev-scene',
  'next-scene',
  'prev-audio',
  'next-audio',
  'audio-ended',
  'select-scene',
  'new-config',
  'import-config',
  'export-config',
  'show-help'
])

// 当前播放时间
const currentTime = ref(0)
const duration = ref(0)
const isSeeking = ref(false)

// 当前场景和音频信息
const currentScene = computed(() => {
  const idx = props.config.currentSceneIndex
  if (idx >= 0 && idx < props.config.scenes.length) {
    return props.config.scenes[idx]
  }
  return null
})

const currentAudio = computed(() => {
  const scene = currentScene.value
  if (!scene) return null
  const idx = props.config.currentAudioIndex
  if (idx >= 0 && idx < scene.audios.length) {
    return scene.audios[idx]
  }
  return null
})

// 加载进度
const loadProgressPercent = computed(() => {
  const { loaded, total } = props.preloadProgress
  if (total === 0) return 100
  return Math.round((loaded / total) * 100)
})

const isPreloading = computed(() => {
  return props.preloadProgress.total > 0 && loadProgressPercent.value < 100
})

// 格式化时间
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 播放进度条拖动
function onProgressInput(e) {
  isSeeking.value = true
  const val = parseFloat(e.target.value)
  currentTime.value = val
}

function onProgressChange(e) {
  const val = parseFloat(e.target.value)
  audioEngine.seek(val)
  isSeeking.value = false
}

// 音量控制
function onVolumeChange(e) {
  const val = parseFloat(e.target.value)
  emit('update:config', { ...props.config, globalVolume: val })
  audioEngine.setGlobalVolume(val)
}

// 播放/暂停
function togglePlay() {
  const newConfig = { ...props.config, isPlaying: !props.config.isPlaying }
  emit('update:config', newConfig)
}

// 注册时间更新回调
watch(() => props.config.isPlaying, (playing) => {
  if (playing) {
    audioEngine.onTimeUpdate((time) => {
      if (!isSeeking.value) {
        currentTime.value = time
      }
    })
    audioEngine.onEnded(() => {
      emit('audio-ended')
    })
    audioEngine.onPlay(() => {
      duration.value = audioEngine.getDuration()
    })
    duration.value = audioEngine.getDuration()
  }
})

// 监听当前音频变化更新时长
watch(currentAudio, () => {
  duration.value = audioEngine.getDuration()
})
</script>

<template>
  <div class="top-bar">
    <!-- 第一行：配置管理和加载进度 -->
    <div class="top-row">
      <div class="config-controls">
        <select
          v-if="config.scenes.length > 0"
          :value="config.currentSceneIndex"
          @change="emit('select-scene', parseInt($event.target.value))"
          class="scene-select"
        >
          <option
            v-for="(scene, idx) in config.scenes"
            :key="scene.id"
            :value="idx"
          >
            {{ scene.name || `场景 ${idx + 1}` }}
          </option>
        </select>
        <span v-else class="no-scene">暂无场景</span>
      </div>
      <div class="config-actions">
        <button @click="emit('new-config')" title="新建配置">新建</button>
        <button @click="emit('import-config')" title="导入配置">导入</button>
        <button @click="emit('export-config')" title="导出配置">导出</button>
        <button @click="emit('show-help')" title="帮助">?</button>
      </div>
    </div>

    <!-- 加载进度条 -->
    <div v-if="isPreloading" class="progress-bar-container">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: loadProgressPercent + '%' }"></div>
      </div>
      <span class="progress-text">加载音频... {{ loadProgressPercent }}%</span>
    </div>

    <!-- 第二行：播放控制 -->
    <div class="playback-row">
      <button @click="emit('prev-scene')" :disabled="!currentScene" title="上一个场景">上一场景</button>
      <button @click="emit('next-scene')" :disabled="!currentScene" title="下一个场景">下一场景</button>
      <button @click="emit('prev-audio')" :disabled="!currentAudio" title="上一个音频">◀</button>
      <button @click="togglePlay" :disabled="!currentAudio" class="play-btn" title="播放/暂停">
        {{ config.isPlaying ? '⏸' : '▶' }}
      </button>
      <button @click="emit('next-audio')" :disabled="!currentAudio" title="下一个音频">▶</button>

      <!-- 播放进度条 -->
      <div class="progress-section">
        <input
          type="range"
          class="progress-slider"
          min="0"
          :max="duration || 0"
          step="0.1"
          :value="currentTime"
          @input="onProgressInput"
          @change="onProgressChange"
          :disabled="!currentAudio"
        />
        <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>

      <!-- 总体音量 -->
      <div class="volume-section">
        <span class="volume-label">音量</span>
        <input
          type="range"
          class="volume-slider"
          min="0"
          max="100"
          :value="config.globalVolume"
          @input="onVolumeChange"
        />
        <span class="volume-value">{{ config.globalVolume }}%</span>
      </div>
    </div>

    <!-- 第三行：当前场景/音频信息 -->
    <div v-if="currentScene" class="info-row">
      <div class="scene-info">
        <span class="info-label">场景：</span>
        <span class="info-value">{{ currentScene.name }}</span>
        <span class="info-detail">音量 {{ currentScene.volume }}%</span>
        <span class="info-detail">淡入 {{ currentScene.fadeIn }}s</span>
        <span class="info-detail">
          {{ PLAY_MODES.find(m => m.value === currentScene.mode)?.label || currentScene.mode }}
        </span>
      </div>
      <div v-if="currentAudio" class="audio-info">
        <span class="info-label">音频：</span>
        <span class="info-value audio-src" :title="currentAudio.src">
          {{ currentAudio.src.split('/').pop() || currentAudio.src }}
        </span>
        <span v-if="currentAudio.start > 0 || currentAudio.end > 0" class="info-detail">
          片段 [{{ formatTime(currentAudio.start) }} - {{ currentAudio.end > 0 ? formatTime(currentAudio.end) : '结束' }}]
        </span>
        <span class="info-detail">音量 {{ currentAudio.volume }}%</span>
      </div>
    </div>
    <div v-else class="info-row empty-info">
      请添加场景和音频源开始播放
    </div>
  </div>
</template>

<style scoped>
.top-bar {
  flex-shrink: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
  min-height: 100px;
}

.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.config-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.scene-select {
  max-width: 300px;
}

.no-scene {
  color: var(--text);
  font-size: 14px;
}

.config-actions {
  display: flex;
  gap: 6px;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  white-space: nowrap;
}

.playback-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.play-btn {
  font-size: 18px;
  padding: 4px 0;
  width: 48px;
  text-align: center;
  line-height: 18px;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 150px;
}

.progress-slider {
  flex: 1;
  min-width: 80px;
}

.time-display {
  font-size: 12px;
  font-family: var(--mono);
  white-space: nowrap;
  min-width: 90px;
}

.volume-section {
  display: flex;
  align-items: center;
  gap: 6px;
}

.volume-label {
  font-size: 13px;
  white-space: nowrap;
}

.volume-slider {
  width: 80px;
}

.volume-value {
  font-size: 12px;
  font-family: var(--mono);
  min-width: 32px;
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 13px;
  padding: 4px 0;
  min-height: 1.6em;
}

.info-row.empty-info {
  color: var(--text);
  font-style: italic;
}

.scene-info,
.audio-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.info-label {
  color: var(--text);
  font-weight: 500;
}

.info-value {
  color: var(--text-h);
  font-weight: 600;
}

.audio-src {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-detail {
  color: var(--text);
  font-size: 12px;
  background: var(--accent-bg);
  padding: 1px 6px;
  border-radius: 3px;
}
</style>
