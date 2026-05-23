/**
 * 配置管理模块
 *
 * 功能：
 * - localStorage 持久化
 * - JSON 导入导出
 * - URL config 参数加载
 * - 新建配置（二次确认）
 */

import { DEFAULT_CONFIG } from './config.js'

const STORAGE_KEY = 'bgm-controller-config'

/**
 * 从 localStorage 读取配置
 * @returns {Object}
 */
export function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('从 localStorage 读取配置失败:', err)
  }
  return null
}

/**
 * 保存配置到 localStorage
 * @param {Object} config
 */
export function saveToStorage(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (err) {
    console.error('保存配置到 localStorage 失败:', err)
  }
}

/**
 * 从 URL 的 config 参数加载配置
 * @returns {Promise<Object|null>}
 */
export async function loadFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const configUrl = params.get('config')
    if (!configUrl) return null

    const response = await fetch(configUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const config = await response.json()
    return config
  } catch (err) {
    console.error('从 URL 加载配置失败:', err)
    return null
  }
}

/**
 * 导出配置为 JSON 文件
 * @param {Object} config
 */
export function exportConfig(config) {
  const json = JSON.stringify(config, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bgm-config-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 导入 JSON 配置文件
 * @returns {Promise<Object|null>}
 */
export function importConfig() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        const text = await file.text()
        const config = JSON.parse(text)
        resolve(config)
      } catch (err) {
        console.error('导入配置失败:', err)
        alert('导入配置失败：文件格式不正确')
        resolve(null)
      }
    }
    input.click()
  })
}

/**
 * 获取初始配置（优先级：URL参数 > localStorage > 默认配置）
 * @returns {Promise<Object>}
 */
export async function getInitialConfig() {
  // 1. 尝试从 URL 加载
  const urlConfig = await loadFromUrl()
  if (urlConfig) {
    saveToStorage(urlConfig)
    return urlConfig
  }

  // 2. 尝试从 localStorage 加载
  const storageConfig = loadFromStorage()
  if (storageConfig) {
    return storageConfig
  }

  // 3. 返回默认配置
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
}
