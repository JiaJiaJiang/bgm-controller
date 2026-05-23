/**
 * 配置文件的数据结构定义和默认值
 *
 * 数据结构：
 * {
 *   scenes: [
 *     {
 *       id: string,          // 唯一标识
 *       name: string,        // 场景名称
 *       volume: number,      // 场景音量 (0-100, 基于总体音量的百分比)
 *       order: number,       // 播放顺序
 *       fadeIn: number,      // 淡入时间(秒)
 *       mode: string,        // 切换模式: 'sequential' | 'sequential-loop' | 'random-loop' | 'single-loop' | 'single-play'
 *       audios: [
 *         {
 *           id: string,      // 唯一标识
 *           src: string,     // 音频源地址
 *           start: number,   // 片段开始时间(秒), 0表示从头
 *           end: number,     // 片段结束时间(秒), 0表示直到结束
 *           volume: number   // 音频音量 (0-100, 基于场景音量的百分比)
 *         }
 *       ]
 *     }
 *   ],
 *   currentSceneIndex: number,  // 当前播放的场景索引
 *   currentAudioIndex: number,  // 当前播放的音频索引
 *   globalVolume: number,       // 总体音量 (0-100)
 *   isPlaying: boolean          // 是否正在播放
 * }
 */

// 默认配置
export const DEFAULT_CONFIG = {
  scenes: [],
  currentSceneIndex: -1,
  currentAudioIndex: -1,
  globalVolume: 80,
  isPlaying: false
}

// 切换模式选项
export const PLAY_MODES = [
  { value: 'sequential', label: '顺序单次' },
  { value: 'sequential-loop', label: '顺序循环' },
  { value: 'random-loop', label: '随机循环' },
  { value: 'single-loop', label: '单曲循环' },
  { value: 'single-play', label: '单曲播放' }
]

// 生成唯一ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

// 创建新的场景对象
export function createScene(name = '新场景') {
  return {
    id: generateId(),
    name,
    volume: 100,
    order: 0,
    fadeIn: 0.1,
    mode: 'sequential-loop',
    audios: []
  }
}

// 创建新的音频对象
export function createAudio(src = '') {
  return {
    id: generateId(),
    src,
    start: 0,
    end: 0,
    volume: 100
  }
}
