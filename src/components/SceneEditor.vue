<script setup>
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { PLAY_MODES, createAudio } from '../stores/config.js'
import * as audioEngine from '../stores/audioEngine.js'

const props = defineProps({
  scene: { type: Object, required: true },
  sceneIndex: { type: Number, required: true }
})

const emit = defineEmits([
  'update:scene',
  'close'
])

// 每个音频的独立测试播放状态
const testPlayStates = ref({})

// 检查音频是否加载失败
function isAudioFailed(idx) {
  return audioEngine.isAudioFailed(props.sceneIndex, idx)
}

function getAudioFailReason(idx) {
  return audioEngine.getAudioFailReason(props.sceneIndex, idx)
}

function onFieldChange(field, value) {
  emit('update:scene', { ...props.scene, [field]: value })
  // 实时更新正在播放的音量
  if (field === 'volume') {
    audioEngine.updateSceneVolume(value)
  }
}

function onAudioFieldChange(audioIndex, field, value) {
  const audios = [...props.scene.audios]
  audios[audioIndex] = { ...audios[audioIndex], [field]: value }
  emit('update:scene', { ...props.scene, audios })
  // 实时更新正在播放的音量
  if (field === 'volume') {
    audioEngine.updateAudioVolume(value)
  }
}

function addAudio() {
  const audios = [...props.scene.audios, createAudio()]
  emit('update:scene', { ...props.scene, audios })
  // 自动滚动到新添加的音频并聚焦输入框
  nextTick(() => {
    const newIndex = audios.length - 1
    const el = document.querySelector(`.audio-src-input-${newIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
    }
  })
}

function removeAudio(index) {
  const audios = props.scene.audios.filter((_, i) => i !== index)
  emit('update:scene', { ...props.scene, audios })
}

function moveAudio(index, direction) {
  const audios = [...props.scene.audios]
  const target = index + direction
  if (target < 0 || target >= audios.length) return
  ;[audios[index], audios[target]] = [audios[target], audios[index]]
  emit('update:scene', { ...props.scene, audios })
}

// 独立测试播放器（使用 new Audio 实现跨域支持）
async function testPlay(audioIndex) {
  const audio = props.scene.audios[audioIndex]
  if (!audio || !audio.src) return

  // 如果正在播放这个音频，停止它
  if (testPlayStates.value[audioIndex]) {
    stopTestPlay(audioIndex)
    return
  }

  // 使用独立的 audio 元素进行测试播放
  const testAudio = new Audio()
  testAudio.crossOrigin = 'anonymous'
  testAudio.src = audio.src
  testAudio.volume = 0.5 // 测试播放音量减半

  // 片段支持
  const audioStart = audio.start || 0
  const audioEnd = audio.end || 0
  testAudio.currentTime = audioStart

  testAudio.onended = () => {
    stopTestPlay(audioIndex)
  }

  // 片段结束检测
  if (audioEnd > audioStart) {
    const checkEnd = () => {
      const state = testPlayStates.value[audioIndex]
      if (state && state.audio.currentTime >= audioEnd) {
        stopTestPlay(audioIndex)
      } else if (testPlayStates.value[audioIndex]) {
        requestAnimationFrame(checkEnd)
      }
    }
    requestAnimationFrame(checkEnd)
  }

  try {
    await testAudio.play()
    testPlayStates.value = {
      ...testPlayStates.value,
      [audioIndex]: { audio: testAudio }
    }
  } catch (err) {
    console.error('测试播放失败:', err)
  }
}

function stopTestPlay(audioIndex) {
  const state = testPlayStates.value[audioIndex]
  if (state) {
    state.audio.pause()
    state.audio.src = ''
  }
  const newStates = { ...testPlayStates.value }
  delete newStates[audioIndex]
  testPlayStates.value = newStates
}

function isTestPlaying(audioIndex) {
  return !!testPlayStates.value[audioIndex]
}

// 关闭编辑器时停止所有测试播放
onUnmounted(() => {
  Object.keys(testPlayStates.value).forEach(idx => {
    stopTestPlay(parseInt(idx))
  })
})

// 点击遮罩层关闭
function onOverlayClick(e) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div class="editor-overlay" @click="onOverlayClick">
    <div class="editor-modal">
      <div class="editor-header">
        <h3>编辑场景：{{ scene.name || '未命名场景' }}</h3>
        <button @click="emit('close')" class="close-btn" title="关闭">×</button>
      </div>

      <div class="editor-body">
        <!-- 场景设置 -->
        <div class="editor-section">
          <h4>场景设置</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>场景名称</label>
              <input
                type="text"
                :value="scene.name"
                @input="onFieldChange('name', $event.target.value)"
                placeholder="输入场景名称"
              />
            </div>
            <div class="form-field">
              <label>场景音量 (%)</label>
              <div class="range-with-value">
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="scene.volume"
                  @input="onFieldChange('volume', parseInt($event.target.value))"
                />
                <span class="range-value">{{ scene.volume }}%</span>
              </div>
            </div>
            <div class="form-field">
              <label>场景顺序</label>
              <input
                type="number"
                min="0"
                :value="scene.order"
                @input="onFieldChange('order', parseInt($event.target.value) || 0)"
              />
            </div>
            <div class="form-field">
              <label>淡入时间 (秒)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                :value="scene.fadeIn"
                @input="onFieldChange('fadeIn', parseFloat($event.target.value) || 0)"
              />
            </div>
            <div class="form-field">
              <label>切换模式</label>
              <select
                :value="scene.mode"
                @change="onFieldChange('mode', $event.target.value)"
              >
                <option
                  v-for="mode in PLAY_MODES"
                  :key="mode.value"
                  :value="mode.value"
                >
                  {{ mode.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 音频源列表 -->
        <div class="editor-section">
          <div class="section-header">
            <h4>音频源列表</h4>
          </div>

          <div v-if="scene.audios.length === 0" class="empty-audios">
            暂无音频源，点击右下角按钮添加
          </div>

          <div v-else class="audio-list">
            <div
              v-for="(audio, idx) in scene.audios"
              :key="audio.id"
              class="audio-item"
              :class="{ 'audio-item-error': isAudioFailed(idx) }"
            >
              <div class="audio-item-header">
                <span class="audio-index">#{{ idx + 1 }}</span>
                <span v-if="isAudioFailed(idx)" class="error-badge" :title="getAudioFailReason(idx)?.suggestion || ''">!</span>
                <button
                  @click="moveAudio(idx, -1)"
                  :disabled="idx === 0"
                  class="small-btn"
                  title="上移"
                >↑</button>
                <button
                  @click="moveAudio(idx, 1)"
                  :disabled="idx === scene.audios.length - 1"
                  class="small-btn"
                  title="下移"
                >↓</button>
                <button
                  @click="removeAudio(idx)"
                  class="small-btn delete-btn"
                  title="删除音频"
                >×</button>
              </div>

              <div class="audio-form">
                <div class="form-field full-width">
                  <label>音频源地址</label>
                  <div class="audio-src-row">
                    <input
                      type="text"
                      :value="audio.src"
                      @input="onAudioFieldChange(idx, 'src', $event.target.value)"
                      placeholder="输入音频URL"
                      class="src-input"
                      :class="'audio-src-input-' + idx"
                    />
                    <button
                      @click="testPlay(idx)"
                      class="test-play-btn-inline"
                      :class="{ playing: isTestPlaying(idx) }"
                      :disabled="!audio.src"
                      :title="isTestPlaying(idx) ? '停止' : '试听'"
                    >
                      {{ isTestPlaying(idx) ? '⏹' : '▶' }}
                    </button>
                  </div>
                </div>
                <div class="form-field">
                  <label>音频截取</label>
                  <div class="clip-row">
                    <span class="clip-label">开始</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      :value="audio.start"
                      @input="onAudioFieldChange(idx, 'start', parseFloat($event.target.value) || 0)"
                      class="clip-input"
                    />
                    <span class="clip-label">结束</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      :value="audio.end"
                      @input="onAudioFieldChange(idx, 'end', parseFloat($event.target.value) || 0)"
                      class="clip-input"
                    />
                    <span class="clip-hint">秒（0=结束）</span>
                  </div>
                </div>
                <div class="form-field">
                  <label>音量 (%)</label>
                  <div class="range-with-value">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      :value="audio.volume"
                      @input="onAudioFieldChange(idx, 'volume', parseInt($event.target.value))"
                    />
                    <span class="range-value">{{ audio.volume }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 浮动添加音频按钮（在弹窗内右下角） -->
        <button @click="addAudio" class="fab-add-audio" title="添加音频">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-modal {
  background: var(--bg);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.editor-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-h);
}

.close-btn {
  font-size: 22px;
  padding: 0 8px;
  line-height: 1;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.close-btn:hover {
  color: var(--text-h);
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  padding-bottom: 80px;
  position: relative;
}

.editor-section {
  margin-bottom: 24px;
}

.editor-section h4 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-h);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h4 {
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.range-with-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-with-value input[type="range"] {
  flex: 1;
}

.range-value {
  font-size: 12px;
  font-family: var(--mono);
  min-width: 36px;
  text-align: right;
}

.add-audio-btn {
  font-size: 13px;
  padding: 4px 10px;
}

.empty-audios {
  text-align: center;
  padding: 20px;
  color: var(--text);
  font-size: 14px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}

.audio-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audio-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.audio-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.audio-index {
  font-size: 12px;
  font-family: var(--mono);
  color: var(--text);
  background: var(--border);
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: auto;
}

/* 加载失败标记 */
.error-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e74c3c;
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
}

.audio-item-error {
  border-color: #e74c3c !important;
  background: rgba(231, 76, 60, 0.05) !important;
}

.audio-item-error:hover {
  background: rgba(231, 76, 60, 0.1) !important;
}

.small-btn {
  font-size: 12px;
  padding: 2px 8px;
  line-height: 1;
}

.delete-btn {
  color: #e74c3c;
}

.delete-btn:hover {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.audio-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.audio-src-row {
  display: flex;
  gap: 6px;
}

.src-input {
  flex: 1;
  min-width: 0;
}

/* 试听按钮（内联在地址栏后面） */
.test-play-btn-inline {
  font-size: 14px;
  padding: 2px 10px;
  line-height: 1;
  background: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent);
  flex-shrink: 0;
}

.test-play-btn-inline:hover {
  background: var(--accent);
  color: var(--bg);
}

.test-play-btn-inline.playing {
  background: #e74c3c;
  border-color: #e74c3c;
  color: white;
}

.test-play-btn-inline.playing:hover {
  background: #c0392b;
}

/* 音频截取行 */
.clip-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clip-label {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}

.clip-input {
  width: 80px;
  flex-shrink: 0;
}

.clip-hint {
  font-size: 11px;
  color: var(--text);
  opacity: 0.7;
  white-space: nowrap;
}

/* 浮动添加音频按钮（在弹窗内右下角，距底部和右边距离相等） */
.fab-add-audio {
  position: sticky;
  bottom: 20px;
  float: right;
  margin-right: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  font-size: 26px;
  font-weight: 300;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
  margin-top: 8px;
  clear: both;
}

.fab-add-audio:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.fab-add-audio:active {
  transform: scale(0.95);
}
</style>
