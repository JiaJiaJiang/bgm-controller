<script setup>
import { ref, computed, watch } from 'vue'
import { PLAY_MODES } from '../stores/config.js'

const props = defineProps({
  config: { type: Object, required: true },
  showAudioPicker: { type: Boolean, default: false }
})

const emit = defineEmits([
  'play-scene',
  'edit-scene',
  'select-audio',
  'add-scene',
  'delete-scene',
  'move-scene-up',
  'move-scene-down'
])

// 选曲弹出菜单状态
const audioPickerSceneIndex = ref(-1)

// 监听外部触发的音频选择器（快捷键 a）
watch(() => props.showAudioPicker, (val) => {
  if (val && props.config.currentSceneIndex >= 0) {
    audioPickerSceneIndex.value = props.config.currentSceneIndex
  }
})

const sortedScenes = computed(() => {
  return [...props.config.scenes].sort((a, b) => a.order - b.order)
})

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function toggleAudioPicker(sceneIndex) {
  if (audioPickerSceneIndex.value === sceneIndex) {
    audioPickerSceneIndex.value = -1
  } else {
    audioPickerSceneIndex.value = sceneIndex
  }
}

function selectAudio(audioIndex) {
  audioPickerSceneIndex.value = -1
  emit('select-audio', audioIndex)
}
</script>

<template>
  <div class="scene-list">
    <div class="scene-list-header">
      <h3>场景列表</h3>
      <button @click="emit('add-scene')" class="add-btn" title="添加场景">+ 添加场景</button>
    </div>

    <div v-if="sortedScenes.length === 0" class="empty-list">
      暂无场景，点击上方按钮添加
    </div>

    <div v-else class="scene-items">
      <div
        v-for="(scene, idx) in sortedScenes"
        :key="scene.id"
        class="scene-item"
        :class="{ active: config.scenes.indexOf(scene) === config.currentSceneIndex }"
        @click="emit('play-scene', config.scenes.indexOf(scene))"
      >
        <div class="scene-item-header">
          <span class="scene-order">#{{ scene.order }}</span>
          <span class="scene-name">{{ scene.name || '未命名场景' }}</span>
          <div class="header-actions">
            <button
              @click.stop="emit('move-scene-up', config.scenes.indexOf(scene))"
              :disabled="idx === 0"
              title="上移"
            >↑</button>
            <button
              @click.stop="emit('move-scene-down', config.scenes.indexOf(scene))"
              :disabled="idx === sortedScenes.length - 1"
              title="下移"
            >↓</button>
            <button
              @click.stop="emit('edit-scene', config.scenes.indexOf(scene))"
              class="edit-btn"
              title="编辑场景"
            >✎</button>
            <button
              @click.stop="emit('delete-scene', config.scenes.indexOf(scene))"
              class="delete-btn"
              title="删除场景"
            >×</button>
          </div>
        </div>

        <div class="scene-item-details">
          <span class="detail">音频 {{ scene.audios.length }} 首</span>
          <span class="scene-mode-badge">{{ PLAY_MODES.find(m => m.value === scene.mode)?.label || scene.mode }}</span>
          <span class="detail">音量 {{ scene.volume }}%</span>
          <span class="detail">淡入 {{ scene.fadeIn }}s</span>
        </div>

        <div v-if="scene.audios.length > 0" class="scene-audio-preview">
          <div
            v-for="audio in scene.audios.slice(0, 3)"
            :key="audio.id"
            class="audio-chip"
            :title="audio.src"
          >
            {{ audio.src.split('/').pop() || '音频' }}
          </div>
          <span v-if="scene.audios.length > 3" class="more-audio">
            +{{ scene.audios.length - 3 }}
          </span>
        </div>

        <div class="scene-item-actions">
          <!-- 选曲按钮（仅当前播放的场景显示） -->
          <button
            v-if="config.scenes.indexOf(scene) === config.currentSceneIndex && scene.audios.length > 0"
            @click.stop="toggleAudioPicker(config.scenes.indexOf(scene))"
            class="track-btn"
            title="选择音频"
          >🎵 {{ config.currentAudioIndex + 1 }}/{{ scene.audios.length }}</button>
        </div>

        <!-- 选曲弹出菜单（固定定位覆盖层） -->
        <Teleport to="body">
          <div
            v-if="audioPickerSceneIndex === config.scenes.indexOf(scene)"
            class="audio-picker-overlay"
            @click="audioPickerSceneIndex = -1"
          >
            <div class="audio-picker" @click.stop>
              <div class="audio-picker-header">
                <span>选择音频 - {{ scene.name || '未命名场景' }}</span>
                <button @click="audioPickerSceneIndex = -1" class="picker-close">×</button>
              </div>
              <div class="audio-picker-list">
                <div
                  v-for="(audio, aidx) in scene.audios"
                  :key="audio.id"
                  class="audio-picker-item"
                  :class="{ selected: aidx === config.currentAudioIndex && config.scenes.indexOf(scene) === config.currentSceneIndex }"
                  @click="selectAudio(aidx)"
                >
                  <span class="picker-index">#{{ aidx + 1 }}</span>
                  <span class="picker-name" :title="audio.src">{{ audio.src.split('/').pop() || '未命名音频' }}</span>
                </div>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-list {
  flex: 1;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 100px;
}

.scene-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border);
}

.scene-list-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h);
}

.add-btn {
  font-size: 13px;
  padding: 4px 10px;
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: var(--text);
  font-size: 14px;
}

.scene-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  overflow-y: auto;
  flex: 1;
  align-content: flex-start;
}

.scene-item {
  flex-shrink: 0;
  width: 100%;
  max-width: 20em;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.scene-item:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.scene-item.active {
  border-color: var(--accent);
  background: var(--accent-bg);
  box-shadow: 0 0 0 1px var(--accent);
}

.scene-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.scene-order {
  font-size: 11px;
  color: var(--text);
  font-family: var(--mono);
  background: var(--border);
  padding: 1px 5px;
  border-radius: 3px;
}

.scene-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-mode-badge {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-bg);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.header-actions button {
  font-size: 12px;
  padding: 1px 5px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.header-actions button:hover {
  opacity: 1;
}

.header-actions .edit-btn {
  font-size: 14px;
}

.header-actions .delete-btn {
  color: #e74c3c;
}

.header-actions .delete-btn:hover {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.scene-item-details {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text);
}

.scene-audio-preview {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.audio-chip {
  font-size: 11px;
  background: var(--border);
  padding: 1px 6px;
  border-radius: 3px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.more-audio {
  font-size: 11px;
  color: var(--text);
}

.scene-item-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  align-items: center;
}

.track-btn {
  font-size: 11px;
  padding: 2px 8px;
  margin-right: auto;
  background: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}

.track-btn:hover {
  background: var(--accent);
  color: var(--bg);
}

.delete-btn {
  color: #e74c3c;
}

.delete-btn:hover {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

/* 选曲弹出覆盖层 */
.audio-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.audio-picker {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  width: 90%;
  max-width: 400px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}

.audio-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h);
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.picker-close {
  font-size: 20px;
  padding: 0 6px;
  line-height: 1;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.picker-close:hover {
  color: var(--text-h);
}

.audio-picker-list {
  overflow-y: auto;
  padding: 8px 0;
}

.audio-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.audio-picker-item:hover {
  background: var(--accent-bg);
}

.audio-picker-item.selected {
  color: var(--accent);
  font-weight: 600;
  background: var(--accent-bg);
}

.picker-index {
  font-family: var(--mono);
  color: var(--text);
  font-size: 12px;
  flex-shrink: 0;
}

.picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
