/**
 * 词典设置页（v0.9.0 起，v0.9.1 加入本地词典管理）
 *
 * 设计：
 * - 顶部「默认词典源」单选列表：仅显示已启用源（disabledIds 排除的源不出现）
 * - 底部「词典源」启/禁列表
 *     - AI 词典：当前唯一可用源，不可禁用（canBeDisabled=false，灰态 + 🔒）
 *     - 本地词典：v0.9.1 起支持用户上传 CSV
 * - v0.9.1：新增「本地词典管理」卡 — 上传 / 列表 / 删除 / 偏好开关
 *
 * 与 Echo-Loop 对齐：禁用当前默认源时自动回退到 AI；
 * 同时参考 Echo-Loop 的可插拔 DictionarySource 架构（id / canBeDisabled / requiresNetwork）。
 */
import { useEffect, useState } from 'react'
import {
  Card, List, Radio, Space, Switch, Tag, Button, message, Spin, Alert, Typography,
  Input, Upload, Popconfirm, Empty, Statistic, Tooltip, Progress,
} from 'antd'
import {
  LockOutlined, CheckCircleFilled, CloseCircleFilled,
  ApiOutlined, BookOutlined, ReloadOutlined,
  InboxOutlined, DeleteOutlined,
  FileTextOutlined, DatabaseOutlined, BulbOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { aiApi, localDictApi } from '@/api'
import { useDictionaryStore } from '@/store/dictionary'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type {
  AIStatus, DictionarySourceMeta, LocalDictionary, LocalDictStatus,
} from '@/types'

const { Text, Title } = Typography
const { Dragger } = Upload

/** 把字节数格式化为可读字符串 */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 把 ISO 时间格式化为本地化短字符串 */
function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function DictionarySettingsPage() {
  const navigate = useNavigate()
  const { isPhone } = useDeviceSize()
  const {
    defaultSourceId, disabledIds, setDefault, setDisabled,
    localDicts, setLocalDicts, addLocalDict, removeLocalDict,
    preferLocalHit, setPreferLocalHit,
  } = useDictionaryStore()
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean, message: string, latency_ms?: number, sample?: string } | null>(null)

  // 本地词典相关 state
  const [localStatus, setLocalStatus] = useState<LocalDictStatus | null>(null)
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 拉取 AI 状态 + 本地词典列表
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      aiApi.status().catch(() => null),
      localDictApi.list().catch(() => null),
      localDictApi.status().catch(() => null),
    ])
      .then(([aiRes, listRes, statusRes]) => {
        if (cancelled) return
        if (aiRes) setStatus(aiRes.data.data)
        if (listRes) setLocalDicts(listRes.data.data.dictionaries ?? [])
        if (statusRes) setLocalStatus(statusRes.data.data)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [setLocalDicts])

  // 拉取本地词典列表
  const refreshLocal = async () => {
    setLoadingLocal(true)
    try {
      const [listRes, statusRes] = await Promise.all([
        localDictApi.list(),
        localDictApi.status(),
      ])
      setLocalDicts(listRes.data.data.dictionaries ?? [])
      setLocalStatus(statusRes.data.data)
    } catch {
      message.error('刷新本地词典失败')
    } finally {
      setLoadingLocal(false)
    }
  }

  // AI 词典连通性测试
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await aiApi.test()
      const d = res.data.data
      setTestResult({
        ok: d.ok,
        message: d.message,
        latency_ms: d.latency_ms,
        sample: d.sample_translation,
      })
      if (d.ok) message.success('AI 词典连通正常')
      else message.warning(d.message)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '测试失败'
      setTestResult({ ok: false, message: msg })
    } finally {
      setTesting(false)
    }
  }

  // 上传本地词典
  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)
    try {
      const form = new FormData()
      form.append('file', file)
      // 缺省用文件名（去掉扩展名）作为词典名
      const defaultName = file.name.replace(/\.(csv|tsv|txt)$/i, '')
      form.append('name', defaultName)
      // 模拟进度（浏览器 XMLHttpRequest 才能拿到真实进度，fetch 看不到）
      const tick = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 10, 90))
      }, 200)
      let res
      try {
        res = await localDictApi.upload(form)
      } finally {
        clearInterval(tick)
      }
      setUploadProgress(100)
      const d = res.data.data
      // 构造完整 LocalDictionary 加入 store
      const newDict: LocalDictionary = {
        id: d.id,
        name: d.name,
        description: '',
        file_name: file.name,
        size_bytes: file.size,
        entry_count: d.entry_count,
        source_lang: 'en',
        target_lang: 'zh',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      addLocalDict(newDict)
      message.success(`导入成功：${d.entry_count} 个词条${d.skipped > 0 ? `（跳过 ${d.skipped} 行）` : ''}`)
      // 刷新 status（更新总词条数）
      localDictApi.status().then((r) => setLocalStatus(r.data.data)).catch(() => {})
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '导入失败'
      message.error(msg)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // 删除本地词典
  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await localDictApi.remove(id)
      removeLocalDict(id)
      message.success('已删除')
      localDictApi.status().then((r) => setLocalStatus(r.data.data)).catch(() => {})
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '删除失败'
      message.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  // 计算每个源的实时状态文案
  const localEntryCount = localStatus?.entry_count ?? 0
  const localDictCount = localStatus?.dict_count ?? 0
  const sources: DictionarySourceMeta[] = [
    {
      id: 'ai',
      label: 'AI 词典',
      emoji: '🤖',
      description: '调用 OpenAI 兼容接口生成结构化词条（音标、词义、例句、词族、词源）。无需下载词库，按需查询。',
      requiresNetwork: true,
      canBeDisabled: false, // AI 词典是当前唯一源，必须始终可用
      statusText: status?.enabled ? '已启用' : '未配置',
      statusKind: status?.enabled ? 'success' : 'warning',
    },
    {
      id: 'local',
      label: '本地词典',
      emoji: '📕',
      description: '基于用户上传的 CSV 词库（支持 ECDICT 转换、Anki 导出等格式）。完全离线查询，无 token 消耗。',
      requiresNetwork: false,
      canBeDisabled: false,
      statusText: localDictCount > 0 ? `已启用 · ${localDictCount} 本 · ${localEntryCount.toLocaleString()} 词` : '未上传',
      statusKind: localDictCount > 0 ? 'success' : 'default',
    },
  ]

  // 默认源候选项：仅显示已启用源
  const visibleSources = sources.filter((s) => !disabledIds.includes(s.id))

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      {/* 顶部标题栏 + 返回 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button
          type="text"
          shape="circle"
          icon={<span style={{ fontSize: 20 }}>←</span>}
          onClick={() => navigate('/settings')}
          aria-label="返回设置"
        />
        <Title level={4} style={{ margin: 0, color: 'var(--ac-text-header, #794f27)', fontWeight: 800, letterSpacing: '0.02em' }}>
          📖 词典设置
        </Title>
      </div>

      {/* AI 配置缺失提示 */}
      {status && !status.enabled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          message="AI 词典未配置"
          description={
            <span>
              请在 backend 端设置环境变量 <Text code>ECHOSUB_AI_BASE_URL</Text> 与 <Text code>ECHOSUB_AI_API_KEY</Text> 后重启服务，然后点击「⚡ 测试连通性」验证。
            </span>
          }
        />
      )}

      {/* 默认词典源（单选） */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '18px 24px' } }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>默认词典源</span>
            <Text type="secondary" style={{ fontSize: 12 }}>打开查词 / 句子详情时优先使用</Text>
          </div>
          <Radio.Group
            value={defaultSourceId}
            onChange={(e) => setDefault(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {visibleSources.map((s) => (
                <Radio
                  key={s.id}
                  value={s.id}
                  disabled={s.id === 'local' && localDictCount === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: defaultSourceId === s.id ? 'var(--color-bg-page, #fafafa)' : 'transparent',
                    width: '100%',
                  }}
                >
                  <span style={{ marginRight: 8, fontSize: 16 }}>{s.emoji}</span>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <Tag
                    color={s.statusKind === 'success' ? 'green' : s.statusKind === 'warning' ? 'orange' : 'default'}
                    style={{ marginLeft: 8 }}
                  >
                    {s.statusText}
                  </Tag>
                </Radio>
              ))}
              {visibleSources.length === 0 && (
                <Text type="secondary">没有可用的词典源，请先在「词典源」中启用至少一个</Text>
              )}
            </Space>
          </Radio.Group>
        </Space>
      </Card>

      {/* 词典源启/禁列表 */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '18px 24px' } }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🧩</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>词典源</span>
            <Text type="secondary" style={{ fontSize: 12 }}>管理各查词源的启用状态</Text>
          </div>
          <List
            dataSource={sources}
            renderItem={(s) => {
              const disabled = disabledIds.includes(s.id)
              const Icon = s.id === 'ai' ? ApiOutlined : BookOutlined
              return (
                <List.Item
                  style={{
                    padding: isPhone ? '12px 4px' : '14px 8px',
                  }}
                  actions={
                    s.canBeDisabled
                      ? [
                        <Switch
                          key="sw"
                          checked={!disabled}
                          onChange={(v) => setDisabled(s.id, !v)}
                        />,
                      ]
                      : [
                        <Tag key="lock" color="default">
                          <LockOutlined /> 始终启用
                        </Tag>,
                      ]
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <span style={{ fontSize: 24 }}>
                        {s.emoji}
                      </span>
                    }
                    title={
                      <Space>
                        <Icon style={{ color: 'var(--ant-color-primary)' }} />
                        <span style={{ fontWeight: 600 }}>{s.label}</span>
                        <Tag color={s.statusKind === 'success' ? 'green' : s.statusKind === 'warning' ? 'orange' : 'default'}>
                          {s.requiresNetwork ? '🌐 联网' : '📦 离线'} · {s.statusText}
                        </Tag>
                      </Space>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {s.description}
                      </Text>
                    }
                  />
                </List.Item>
              )
            }}
          />
        </Space>
      </Card>

      {/* AI 词典连通性测试 */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '18px 24px' } }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>连通性测试</span>
            <Text type="secondary" style={{ fontSize: 12 }}>验证当前 AI 配置能否正常返回词典结果</Text>
          </div>
          <Space wrap>
            <Button
              type="primary"
              icon={<ApiOutlined />}
              loading={testing}
              onClick={handleTest}
              disabled={!status?.enabled}
              size={isPhone ? 'middle' : 'large'}
              style={{ borderRadius: 10, minHeight: 44 }}
            >
              ⚡ 测试 AI 连通性
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setLoading(true)
                aiApi.status()
                  .then((res) => setStatus(res.data.data))
                  .finally(() => setLoading(false))
              }}
              size={isPhone ? 'middle' : 'large'}
              style={{ borderRadius: 10, minHeight: 44 }}
            >
              刷新状态
            </Button>
          </Space>
          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              icon={testResult.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
              message={
                <Space>
                  <span>{testResult.message}</span>
                  {testResult.latency_ms !== undefined && testResult.latency_ms > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {testResult.latency_ms}ms
                    </Text>
                  )}
                </Space>
              }
              description={
                testResult.ok && testResult.sample ? (
                  <span>
                    <Text type="secondary">Hello → </Text>
                    <Text strong>{testResult.sample}</Text>
                  </span>
                ) : null
              }
              style={{ borderRadius: 12 }}
            />
          )}
        </Space>
      </Card>

      {/* 本地词典管理（v0.9.1） */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '18px 24px' } }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>📕</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>本地词典</span>
            <Text type="secondary" style={{ fontSize: 12 }}>上传 CSV 词库，离线查词、零 token 消耗</Text>
            <div style={{ flex: 1 }} />
            <Tooltip title="刷新本地词典列表">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={refreshLocal}
                loading={loadingLocal}
              />
            </Tooltip>
          </div>

          {/* 统计 */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Statistic
              title="已上传词典"
              value={localDictCount}
              suffix="本"
              prefix={<DatabaseOutlined style={{ color: 'var(--ant-color-primary)' }} />}
            />
            <Statistic
              title="总词条数"
              value={localEntryCount}
              suffix="词"
              prefix={<FileTextOutlined style={{ color: 'var(--ant-color-primary)' }} />}
            />
            <Statistic
              title="单本上限"
              value={fmtBytes(localStatus?.max_bytes ?? 0)}
              valueStyle={{ fontSize: 14 }}
            />
          </div>

          {/* 偏好：命中本地后是否跳过 AI */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: 'var(--color-bg-page, #fafafa)', borderRadius: 10,
          }}>
            <Switch
              size="small"
              checked={preferLocalHit}
              onChange={setPreferLocalHit}
            />
            <Text style={{ fontSize: 13 }}>本地词典命中后直接返回，不再调用 AI</Text>
            <Tooltip title="关闭时无论本地是否命中都会调一次 AI（用于对比质量或学习 AI 解释）">
              <BulbOutlined style={{ color: 'var(--color-text-secondary)' }} />
            </Tooltip>
          </div>

          {/* 上传区 */}
          <Dragger
            name="file"
            multiple={false}
            accept=".csv,.tsv,.txt"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file)
              return false // 阻止默认上传，自己处理
            }}
            disabled={uploading}
            style={{
              borderRadius: 12,
              background: uploading ? 'var(--color-bg-page, #fafafa)' : undefined,
            }}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
              <InboxOutlined style={{ color: 'var(--ant-color-primary)' }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 600 }}>
              {uploading ? `导入中… ${uploadProgress}%` : '点击或拖拽 CSV 文件到此区域上传'}
            </p>
            <p className="ant-upload-hint" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              支持 .csv / .tsv / .txt 格式；UTF-8 编码；列名 <Text code>word,phonetic,translation</Text>（兼容 term/lemma/ipa/gloss 等别名）
            </p>
            {uploading && (
              <Progress
                percent={uploadProgress}
                size="small"
                style={{ maxWidth: 320, margin: '8px auto 0' }}
                showInfo
              />
            )}
          </Dragger>

          {/* 已上传列表 */}
          {localDicts.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无本地词典，请上传 CSV 词库"
              style={{ padding: '12px 0' }}
            />
          ) : (
            <List
              dataSource={localDicts}
              size="small"
              renderItem={(d) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="del"
                      title="删除该词典？"
                      description={`将同时删除其下 ${d.entry_count.toLocaleString()} 个词条，操作不可撤销。`}
                      onConfirm={() => handleDelete(d.id)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        loading={deletingId === d.id}
                      >
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<BookOutlined style={{ fontSize: 20, color: 'var(--ant-color-primary)' }} />}
                    title={
                      <Space>
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                        <Tag color="blue">{d.entry_count.toLocaleString()} 词</Tag>
                        {d.source_lang && d.target_lang && (
                          <Tag>{d.source_lang.toUpperCase()} → {d.target_lang.toUpperCase()}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space size={12} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <FileTextOutlined /> {d.file_name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {fmtBytes(d.size_bytes)}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {fmtTime(d.created_at)}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}

          {/* 偏好测试入口（开发体验）：点击按钮立即试查一个单词 */}
          {localDicts.length > 0 && (
            <LocalDictQuickTest />
          )}
        </Space>
      </Card>

      {/* 提示 */}
      <Card
        style={{
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-page, #FFF9F0)',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '18px 24px' } }}
      >
        <Space direction="vertical" size={4}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>使用提示</span>
          </div>
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
            • 在播放器中点击任意一条字幕，可进入「句子详情」查看 AI 翻译、逐词拆解与语法解析。
            <br />
            • 句子详情页查询会使用此处选择的「默认词典源」逐词查询；本地命中后默认不再调 AI（可关闭）。
            <br />
            • 词典源设置保存在浏览器 localStorage（key: <Text code>echosub:dictionary-settings</Text>），切换设备需要重新设置。
            <br />
            • 本地词典格式：UTF-8 CSV，列名兼容 <Text code>word/term/lemma/headword</Text> + <Text code>phonetic/ipa</Text> + <Text code>translation/definition/meaning</Text>，可下载 ECDICT 转换工具导出。
          </Text>
        </Space>
      </Card>
    </div>
  )
}

/** 本地词典快速试查组件（v0.9.1 体验增强） */
function LocalDictQuickTest() {
  const [word, setWord] = useState('')
  const [result, setResult] = useState<{
    found: boolean
    word: string
    entries: Array<{ dict_name: string; word: string; phonetic: string; translation: string; matched_by: string }>
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTest = async () => {
    if (!word.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await localDictApi.lookup({ word: word.trim() })
      setResult(res.data.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '查询失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ borderTop: '1px dashed var(--color-border-soft, rgba(0,0,0,0.06))', paddingTop: 12 }}>
      <Space style={{ width: '100%' }} direction="vertical" size={8}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <SearchOutlined /> 快速试查本地词典
        </Text>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入英文单词，如 study / studying"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onPressEnter={handleTest}
            allowClear
            size="middle"
          />
          <Button type="primary" onClick={handleTest} loading={loading} icon={<SearchOutlined />}>
            查词
          </Button>
        </Space.Compact>
        {error && <Alert type="error" showIcon message={error} />}
        {result && (
          result.found ? (
            <List
              size="small"
              dataSource={result.entries}
              renderItem={(e) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Space>
                      <Text strong>{e.word}</Text>
                      {e.phonetic && <Text type="secondary">{e.phonetic}</Text>}
                      <Tag color={e.matched_by === 'exact' ? 'green' : 'orange'}>
                        {e.matched_by === 'exact' ? '精确' : `词形: ${e.matched_by}`}
                      </Tag>
                      <Tag>{e.dict_name}</Tag>
                    </Space>
                    <Text>{e.translation}</Text>
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Alert type="info" showIcon message={`未收录「${result.word}」`} />
          )
        )}
      </Space>
    </div>
  )
}
