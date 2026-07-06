/**
 * 词典设置页（v0.9.0）
 *
 * 设计：
 * - 顶部「默认词典源」单选列表：仅显示已启用源（disabledIds 排除的源不出现）
 * - 底部「词典源」启/禁列表：
 *     - AI 词典：当前唯一可用源，不可禁用（canBeDisabled=false，灰态 + 🔒）
 *     - 本地词典：v0.9.0 占位（canBeDisabled=false，灰态 + 即将推出）
 * - 与 Echo-Loop 对齐：禁用当前默认源时自动回退到 AI
 *
 * 数据来源：useDictionaryStore（localStorage 持久化，跨端生效）
 */
import { useEffect, useState } from 'react'
import { Card, List, Radio, Space, Switch, Tag, Button, message, Spin, Alert, Typography } from 'antd'
import { LockOutlined, CheckCircleFilled, CloseCircleFilled, ApiOutlined, BookOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { aiApi } from '@/api'
import { useDictionaryStore } from '@/store/dictionary'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { AIStatus, DictionarySourceMeta } from '@/types'

const { Text, Title } = Typography

export default function DictionarySettingsPage() {
  const navigate = useNavigate()
  const { isPhone } = useDeviceSize()
  const { defaultSourceId, disabledIds, setDefault, setDisabled } = useDictionaryStore()
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean, message: string, latency_ms?: number, sample?: string } | null>(null)

  // 拉取 AI 状态
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    aiApi.status()
      .then((res) => { if (!cancelled) setStatus(res.data.data) })
      .catch(() => { /* 静默 */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // AI 词典连通性测试（v0.9.0：复用 v0.8.1 /ai/test）
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

  // 计算每个源的实时状态文案
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
      description: '基于离线 SQLite 词库（如 ECDICT）的查词能力，无需联网。v0.10.0 推出，本版本先占位。',
      requiresNetwork: false,
      canBeDisabled: false,
      statusText: '即将推出',
      statusKind: 'default',
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
            • 句子详情页查询会使用此处选择的「默认词典源」逐词查询。
            <br />
            • 词典源设置保存在浏览器 localStorage（key: <Text code>echosub:dictionary-settings</Text>），切换设备需要重新设置。
            <br />
            • 「本地词典」将在 v0.10.0 引入，届时可下载 ECDICT 离线词库，无需联网即可查词。
          </Text>
        </Space>
      </Card>
    </div>
  )
}
