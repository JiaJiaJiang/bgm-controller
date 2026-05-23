<script setup>
const emit = defineEmits(['close'])

function onOverlayClick(e) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div class="help-overlay" @click="onOverlayClick">
    <div class="help-modal">
      <div class="help-header">
        <h3>帮助</h3>
        <button @click="emit('close')" class="close-btn" title="关闭">×</button>
      </div>

      <div class="help-body">
        <section>
          <h4>关于 BGM Controller</h4>
          <p>这是一个通过纯前端网页使用 Web Audio API 实现的背景音乐播放控制器，适配手机和电脑浏览器。</p>
          <p>支持导入导出 JSON 格式配置文件，配置会自动保存在浏览器本地存储（localStorage）中。</p>
        </section>

        <section>
          <h4>快捷键</h4>
          <div class="shortcut-list">
            <div class="shortcut-item">
              <kbd>空格</kbd>
              <span>播放 / 暂停</span>
            </div>
            <div class="shortcut-item">
              <kbd>[</kbd>
              <span>上一个音频</span>
            </div>
            <div class="shortcut-item">
              <kbd>]</kbd>
              <span>下一个音频</span>
            </div>
            <div class="shortcut-item">
              <kbd>A</kbd>
              <span>打开当前场景的音频列表</span>
            </div>
            <div class="shortcut-item">
              <kbd>+</kbd>
              <span>增加总体音量</span>
            </div>
            <div class="shortcut-item">
              <kbd>-</kbd>
              <span>减少总体音量</span>
            </div>
            <div class="shortcut-item">
              <kbd>0</kbd> ~ <kbd>9</kbd>
              <span>跳转到对应编号的场景</span>
            </div>
          </div>
          <p class="note">快捷键在输入框中无效，请先点击非输入框区域再使用。</p>
        </section>

        <section>
          <h4>场景编号规则</h4>
          <p>场景编号（场景顺序）必须是唯一的。当设置重复编号时，系统会自动将冲突的编号依次后移。</p>
        </section>

        <section>
          <h4>项目地址</h4>
          <p class="github-link">
            GitHub: <a href="https://github.com/your-username/bgm-controller" target="_blank" rel="noopener">https://github.com/your-username/bgm-controller</a>
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-modal {
  background: var(--bg);
  border-radius: 12px;
  width: 90%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.help-header h3 {
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

.help-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.help-body section {
  margin-bottom: 20px;
}

.help-body section:last-child {
  margin-bottom: 0;
}

.help-body h4 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-h);
}

.help-body p {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.shortcut-item kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 3px 8px;
  font-family: var(--mono);
  font-size: 13px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-h);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.shortcut-item span {
  color: var(--text);
}

.note {
  font-size: 13px !important;
  color: var(--text) !important;
  opacity: 0.7;
  margin-top: 8px !important;
}

.github-link {
  font-family: var(--mono);
  font-size: 13px !important;
}

.github-link a {
  color: var(--accent);
  text-decoration: none;
}

.github-link a:hover {
  text-decoration: underline;
}
</style>
