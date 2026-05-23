/**
 * 音频引擎模块 - 基于 Web Audio API
 *
 * 架构（所有连接永久固定，不需要断开）：
 *   每个场景的每个音频 → 独立 Audio + MediaElementSourceNode → 场景的 fadeGain → 场景的 volumeGain → masterGain → destination
 *
 * 淡入淡出：使用 JS interval 完全控制，不依赖 Web Audio API 的自动化调度
 */

// ==================== 类定义 ====================

/** 单个音频源 */
class AudioSource {
  constructor(url, audio, sourceNode) {
    this.url = url
    this.audio = audio          // HTMLAudioElement
    this.sourceNode = sourceNode // MediaElementAudioSourceNode
    this.loadFailed = false
    this.failReason = null
    this.failSuggestion = null
  }
}

/** 场景的淡入淡出状态 */
class FadeState {
  constructor() {
    this.steps = 0          // 剩余步数
    this.stepChange = 0     // 每步变化量（正=淡入，负=淡出）
    this.targetAudio = null // 淡出完成时要暂停的音频
    this.isFadingOut = false
  }
}

/** 场景节点 */
class SceneNode {
  constructor(sceneIndex, sceneConfig) {
    this.sceneIndex = sceneIndex
    this.volumeGain = null  // GainNode - 场景音量（固定）
    this.fadeGain = null    // GainNode - 淡入淡出（动态）
    this.audioSources = new Map() // Map<audioIndex, AudioSource>
    this.fade = new FadeState()
  }
}

// ==================== 全局状态 ====================

let audioContext = null
let masterGain = null

// 当前播放状态
let currentSceneIndex = -1
let currentAudioIndex = -1
let isPlaying = false
let isPaused = false
let pauseOffset = 0

// 回调
let onTimeUpdateCallback = null
let onEndedCallback = null
let onPlayCallback = null

// 场景树: Map<sceneIndex, SceneNode>
const scenes = new Map()

// 淡入淡出 interval
const FADE_INTERVAL_MS = 30
let fadeIntervalId = null

// ==================== 内部函数 ====================

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = audioContext.createGain()
    masterGain.gain.value = 0.8
    masterGain.connect(audioContext.destination)
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

function getOrCreateScene(sceneIndex, sceneConfig) {
  if (scenes.has(sceneIndex)) return scenes.get(sceneIndex)

  const ctx = getAudioContext()
  const node = new SceneNode(sceneIndex, sceneConfig)

  node.volumeGain = ctx.createGain()
  node.volumeGain.gain.value = (sceneConfig?.volume ?? 100) / 100
  node.volumeGain.connect(masterGain)

  node.fadeGain = ctx.createGain()
  node.fadeGain.gain.value = 1
  node.fadeGain.connect(node.volumeGain)

  scenes.set(sceneIndex, node)
  return node
}

function getCurrentScene() {
  return scenes.get(currentSceneIndex) || null
}

function getCurrentAudioSource() {
  const scene = getCurrentScene()
  if (!scene) return null
  return scene.audioSources.get(currentAudioIndex) || null
}

// ==================== 淡入淡出系统 ====================

function startFadeLoop() {
  if (fadeIntervalId) return
  fadeIntervalId = setInterval(() => {
    if (isPaused) return // 暂停时不处理

    let hasActive = false
    for (const [, scene] of scenes) {
      const f = scene.fade
      if (f.steps <= 0) continue

      hasActive = true
      // 应用渐变
      let newVal = scene.fadeGain.gain.value + f.stepChange
      if (f.isFadingOut) {
        newVal = Math.max(0, newVal)
      } else {
        newVal = Math.min(1, newVal)
      }
      scene.fadeGain.gain.value = newVal
      f.steps--

      if (f.steps <= 0) {
        // 淡出完成：暂停音频
        if (f.isFadingOut && f.targetAudio) {
          f.targetAudio.pause()
          f.targetAudio.currentTime = 0
          f.targetAudio.onended = null
        }
        f.targetAudio = null
      }
    }

    if (!hasActive) {
      clearInterval(fadeIntervalId)
      fadeIntervalId = null
    }
  }, FADE_INTERVAL_MS)
}

/**
 * 为场景设置淡入或淡出
 */
function setSceneFade(sceneIndex, duration, fadeIn, targetAudio) {
  const scene = scenes.get(sceneIndex)
  if (!scene) return

  const totalSteps = Math.max(1, Math.round((duration * 1000) / FADE_INTERVAL_MS))
  const currentVal = scene.fadeGain.gain.value
  const targetVal = fadeIn ? 1 : 0
  const stepChange = (targetVal - currentVal) / totalSteps

  scene.fade.steps = totalSteps
  scene.fade.stepChange = stepChange
  scene.fade.targetAudio = targetAudio
  scene.fade.isFadingOut = !fadeIn

  startFadeLoop()
}

// ==================== 导出函数 ====================

export function getErrorReason(err) {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError': return '浏览器阻止了音频加载（需要用户交互）'
      case 'NetworkError': return '网络错误，无法连接到音频服务器'
      case 'AbortError': return '加载被中断'
      case 'NotSupportedError': return '音频格式不支持'
      case 'SecurityError': return '跨域安全限制（CORS）'
    }
  }
  if (err.message) {
    if (err.message.includes('CORS') || err.message.includes('cross-origin')) return '跨域访问被拒绝（CORS）'
    if (err.message.includes('404')) return '音频文件不存在（404）'
    if (err.message.includes('timeout')) return '加载超时'
    if (err.message.includes('network')) return '网络连接失败'
  }
  return err.message || '未知错误'
}

export function getErrorSuggestion(err) {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'SecurityError': return '建议：将音频文件放在同域名下，或配置服务器添加 CORS 头（Access-Control-Allow-Origin: *）'
      case 'NetworkError': return '建议：检查网络连接和音频URL是否正确'
      case 'NotAllowedError': return '建议：点击页面任意位置后再试'
    }
  }
  if (err.message) {
    if (err.message.includes('CORS') || err.message.includes('cross-origin')) return '建议：将音频文件放在同域名下，或配置服务器添加 CORS 头'
    if (err.message.includes('404')) return '建议：检查音频URL是否正确'
  }
  return '建议：检查音频URL是否正确，或尝试将音频文件放在同域名下'
}

export async function preloadAudio(url, sceneIndex, audioIndex, sceneConfig) {
  const scene = getOrCreateScene(sceneIndex, sceneConfig)
  if (scene.audioSources.has(audioIndex)) return scene.audioSources.get(audioIndex)

  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, 30000)

    function cleanup() {
      clearTimeout(timeout)
      audio.oncanplaythrough = null
      audio.onerror = null
    }

    audio.oncanplaythrough = () => {
      cleanup()
      try {
        const ctx = getAudioContext()
        const sourceNode = ctx.createMediaElementSource(audio)
        sourceNode.connect(scene.fadeGain)
        const src = new AudioSource(url, audio, sourceNode)
        scene.audioSources.set(audioIndex, src)
        resolve(src)
      } catch (e) {
        reject(e)
      }
    }

    audio.onerror = () => {
      cleanup()
      const err = audio.error
      const error = new DOMException(
        err?.message || '音频加载失败',
        err?.code === MediaError.MEDIA_ERR_NETWORK ? 'NetworkError' :
        err?.code === MediaError.MEDIA_ERR_DECODE ? 'DecodeError' :
        err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'NotSupportedError' :
        'UnknownError'
      )
      const src = new AudioSource(url, audio, null)
      src.loadFailed = true
      src.failReason = getErrorReason(error)
      src.failSuggestion = getErrorSuggestion(error)
      scene.audioSources.set(audioIndex, src)
      reject(error)
    }

    audio.src = url
    audio.load()
  })
}

export async function preloadAllAudios(scenes, onProgress, onError) {
  const tasks = []
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]
    for (let ai = 0; ai < scene.audios.length; ai++) {
      const audio = scene.audios[ai]
      if (audio.src) {
        tasks.push({ si, ai, url: audio.src, sceneName: scene.name || '未命名场景' })
      }
    }
  }

  if (tasks.length === 0) {
    onProgress?.(1, 1)
    return
  }

  let loaded = 0
  const total = tasks.length

  const promises = tasks.map(t =>
    preloadAudio(t.url, t.si, t.ai, scenes[t.si])
      .then(() => { loaded++; onProgress?.(loaded, total) })
      .catch(() => { loaded++; onProgress?.(loaded, total); onError?.(t.url, t.sceneName) })
  )

  await Promise.allSettled(promises)
}

export function getPreloadProgress(configScenes) {
  let total = 0, loaded = 0
  for (let si = 0; si < configScenes.length; si++) {
    const scene = configScenes[si]
    for (let ai = 0; ai < scene.audios.length; ai++) {
      if (scene.audios[ai].src) {
        total++
        const node = scenes.get(si)
        if (node && node.audioSources.has(ai)) loaded++
      }
    }
  }
  return { loaded, total }
}

export function setGlobalVolume(volume) {
  if (masterGain) masterGain.gain.value = volume / 100
}

export function updateSceneVolume(sceneVolume) {
  for (const [, scene] of scenes) {
    scene.volumeGain.gain.value = sceneVolume / 100
  }
}

export function updateAudioVolume(audioVolume) {
  const src = getCurrentAudioSource()
  if (src) src.audio.volume = audioVolume / 100
}

/**
 * 播放指定场景的指定音频
 */
export function playSceneAudio(sceneIndex, audioIndex, audioConfig, sceneConfig) {
  const scene = getOrCreateScene(sceneIndex, sceneConfig)
  let src = scene.audioSources.get(audioIndex)

  if (!src) {
    const url = audioConfig?.src
    if (!url) return
    try {
      const ctx = getAudioContext()
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = url
      const sourceNode = ctx.createMediaElementSource(audio)
      sourceNode.connect(scene.fadeGain)
      src = new AudioSource(url, audio, sourceNode)
      scene.audioSources.set(audioIndex, src)
    } catch (e) {
      console.error('创建音频源失败:', e)
      return
    }
  }

  const { audio } = src

  // 如果已暂停且是同一个音频，恢复
  if (isPaused && currentSceneIndex === sceneIndex && currentAudioIndex === audioIndex) {
    resume()
    return
  }

  const isSceneSwitch = currentSceneIndex >= 0 && currentSceneIndex !== sceneIndex

  if (isSceneSwitch) {
    // === 离开旧场景：设置淡出 ===
    const oldScene = scenes.get(currentSceneIndex)
    if (oldScene) {
      const oldSrc = oldScene.audioSources.get(currentAudioIndex)
      const fadeOutTime = Math.max(sceneConfig?.fadeIn || 0.1, 0.1)
      setSceneFade(currentSceneIndex, fadeOutTime, false, oldSrc?.audio || null)
    }

    // === 进入新场景 ===
    scene.volumeGain.gain.value = (sceneConfig?.volume ?? 100) / 100

    // 如果新场景正在淡出，立即停止其旧音频并清除淡出状态
    if (scene.fade.isFadingOut && scene.fade.steps > 0) {
      // 立即停止正在淡出的旧音频
      if (scene.fade.targetAudio) {
        scene.fade.targetAudio.pause()
        scene.fade.targetAudio.currentTime = 0
        scene.fade.targetAudio.onended = null
        scene.fade.targetAudio = null
      }
      scene.fade.steps = 0
    }

    // 从 0 开始淡入新音频
    const fadeInTime = sceneConfig?.fadeIn || 0.1
    if (fadeInTime > 0) {
      scene.fadeGain.gain.value = 0
      setSceneFade(sceneIndex, fadeInTime, true, null)
    } else {
      scene.fadeGain.gain.value = 1
    }
  } else if (currentAudioIndex !== audioIndex) {
    // 同一场景内切换音频：立即停止旧音频
    const oldSrc = scene.audioSources.get(currentAudioIndex)
    if (oldSrc) {
      oldSrc.audio.pause()
      oldSrc.audio.onended = null
      oldSrc.audio.currentTime = 0
    }
  }

  // 更新当前播放索引
  currentSceneIndex = sceneIndex
  currentAudioIndex = audioIndex

  // 设置片段起始位置
  const audioStart = audioConfig?.start ?? 0
  const audioEnd = audioConfig?.end ?? 0
  audio.currentTime = audioStart

  // 设置音频音量
  audio.volume = (audioConfig?.volume ?? 100) / 100

  // 片段结束检测
  if (audioEnd > audioStart) {
    const checkEnd = () => {
      if (isPlaying && audio.currentTime >= audioEnd) {
        audio.pause()
        isPlaying = false
        cancelAnimationFrame(animationFrameId)
        onEndedCallback?.()
      } else if (isPlaying) {
        requestAnimationFrame(checkEnd)
      }
    }
    requestAnimationFrame(checkEnd)
  }

  // 播放结束事件
  audio.onended = () => {
    if (isPlaying) {
      isPlaying = false
      cancelAnimationFrame(animationFrameId)
      onEndedCallback?.()
    }
  }

  // 确保 AudioContext 处于运行状态
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume()
  }

  // 开始播放
  audio.play().then(() => {
    isPlaying = true
    isPaused = false
    pauseOffset = 0
    onPlayCallback?.()
    startTimeUpdateLoop()
  }).catch(err => {
    if (err.name !== 'AbortError') {
      console.error('播放失败:', err)
    }
    isPlaying = false
  })
}

export function pause() {
  const src = getCurrentAudioSource()
  if (!src || !isPlaying) return

  pauseOffset = src.audio.currentTime
  isPaused = true
  isPlaying = false
  src.audio.pause()
  cancelAnimationFrame(animationFrameId)
}

export function resume() {
  const src = getCurrentAudioSource()
  if (!src || !isPaused) return

  isPaused = false
  src.audio.play().then(() => {
    isPlaying = true
    startTimeUpdateLoop()
  }).catch(err => {
    if (err.name !== 'AbortError') {
      console.error('恢复播放失败:', err)
    }
    isPlaying = false
  })
}

export function stop() {
  cancelAnimationFrame(animationFrameId)

  if (fadeIntervalId) {
    clearInterval(fadeIntervalId)
    fadeIntervalId = null
  }

  for (const [, scene] of scenes) {
    scene.fade.steps = 0
    scene.fade.targetAudio = null
    for (const [, src] of scene.audioSources) {
      src.audio.pause()
      src.audio.currentTime = 0
      src.audio.onended = null
    }
  }

  isPlaying = false
  isPaused = false
  pauseOffset = 0
}

export function getCurrentTime() {
  const src = getCurrentAudioSource()
  if (!src) return isPaused ? pauseOffset : 0
  if (isPaused) return pauseOffset
  return src.audio.currentTime
}

export function getDuration() {
  const src = getCurrentAudioSource()
  if (!src) return 0
  const d = src.audio.duration
  if (!isFinite(d) || isNaN(d)) return 0
  return d
}

export function seek(time) {
  const src = getCurrentAudioSource()
  if (!src) return

  if (isPaused) {
    pauseOffset = time
    src.audio.currentTime = time
    return
  }

  if (isPlaying) {
    src.audio.currentTime = time
  }
}

export function onTimeUpdate(callback) { onTimeUpdateCallback = callback }
export function onEnded(callback) { onEndedCallback = callback }
export function onPlay(callback) { onPlayCallback = callback }

let animationFrameId = null

function startTimeUpdateLoop() {
  const loop = () => {
    const src = getCurrentAudioSource()
    if (isPlaying && onTimeUpdateCallback && src) {
      onTimeUpdateCallback(src.audio.currentTime)
    }
    animationFrameId = requestAnimationFrame(loop)
  }
  loop()
}

export function getPlayState() {
  return {
    isPlaying, isPaused,
    currentTime: getCurrentTime(),
    duration: getDuration()
  }
}

export function clearCache() {
  stop()
  for (const [, scene] of scenes) {
    for (const [, src] of scene.audioSources) {
      src.audio.pause()
      src.audio.src = ''
    }
  }
  scenes.clear()
  currentSceneIndex = -1
  currentAudioIndex = -1
}

export function getCachedAudio(url, sceneIndex, audioIndex) {
  const scene = scenes.get(sceneIndex)
  if (!scene) return null
  const src = scene.audioSources.get(audioIndex)
  return src?.audio || null
}

export function isAudioFailed(sceneIndex, audioIndex) {
  const scene = scenes.get(sceneIndex)
  if (!scene) return false
  const src = scene.audioSources.get(audioIndex)
  return src?.loadFailed || false
}

export function getAudioFailReason(sceneIndex, audioIndex) {
  const scene = scenes.get(sceneIndex)
  if (!scene) return null
  const src = scene.audioSources.get(audioIndex)
  if (!src || !src.loadFailed) return null
  return { reason: src.failReason, suggestion: src.failSuggestion }
}

export function clearSceneFailures(sceneIndex) {
  const scene = scenes.get(sceneIndex)
  if (!scene) return
  for (const [, src] of scene.audioSources) {
    src.loadFailed = false
    src.failReason = null
    src.failSuggestion = null
  }
}
