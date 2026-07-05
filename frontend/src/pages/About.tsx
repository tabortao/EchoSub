/**
 * 关于页面 —— 项目介绍、特点、使用方法、作者信息。
 * 设计风格与小学生审美主题一致：多彩、圆角、渐变、emoji 装饰。
 */
import { Card, Row, Col, Typography, Tag, Space, Divider } from 'antd'
import {
  GithubOutlined,
  HeartFilled,
  StarFilled,
  CheckCircleOutlined,
  BookOutlined,
  SoundOutlined,
  FolderOutlined,
  TagsOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

// ── 特性卡片数据 ──
const features = [
  {
    icon: <BookOutlined />,
    emoji: '📖',
    title: '逐句复读',
    desc: '智能解析字幕，逐句/循环播放，句末自动停顿，支持跟读背诵。',
    color: '#FF7A45',
  },
  {
    icon: <SoundOutlined />,
    emoji: '🎤',
    title: 'TTS 朗读',
    desc: '内置 Edge TTS 语音合成，9 种音色可选，0.5-2.0 倍速朗读课文。',
    color: '#52C41A',
  },
  {
    icon: <FolderOutlined />,
    emoji: '📂',
    title: '专辑管理',
    desc: '自动识别专辑/子专辑（类似 Emby），Emby 风格海报墙浏览。',
    color: '#1890FF',
  },
  {
    icon: <TagsOutlined />,
    emoji: '🏷️',
    title: '标签系统',
    desc: '用户级多对多标签，灵活筛选与分类学习资源。',
    color: '#722ED1',
  },
  {
    icon: <CloudUploadOutlined />,
    emoji: '⬆️',
    title: '拖拽上传',
    desc: '支持拖拽或选择文件上传，fsnotify 自动监控目录变化。',
    color: '#FAAD14',
  },
  {
    icon: <HistoryOutlined />,
    emoji: '📊',
    title: '学习记录',
    desc: '周/月/年学习统计，逐句进度跟踪，已背诵句子计数。',
    color: '#EB2F96',
  },
]

// ── 使用步骤数据 ──
const steps = [
  { num: '1', emoji: '📁', title: '放入媒体文件', desc: '把视频/音频文件 + 字幕文件放入媒体目录（支持自动扫描）' },
  { num: '2', emoji: '👀', title: '自动识别专辑', desc: '系统自动按目录结构识别专辑、子专辑，Emby 风格海报墙' },
  { num: '3', emoji: '🎧', title: '点击播放', desc: '点击任意媒体进入播放器，支持逐句复读、循环播放、TTS 朗读' },
  { num: '4', emoji: '⭐', title: '收藏重难点', desc: '星标收藏重难点句子，可按收藏列表顺序播放' },
  { num: '5', emoji: '📈', title: '跟踪进度', desc: '学习记录页面查看统计，句子听遍数、完成率一目了然' },
]

export default function About() {
  return (
    <div>
      {/* 顶部 Hero 区 - AC 风暖羊皮纸背景 */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 24,
          border: '3px solid rgba(25, 200, 185, 0.25)',
          background: 'linear-gradient(135deg, var(--ac-bg-content, rgb(247, 243, 223)), var(--ac-bg-page, #f8f8f0))',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(25, 200, 185, 0.12)',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: 'clamp(20px, 4vw, 32px) clamp(12px, 3vw, 24px)', textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(48px, 12vw, 64px)', marginBottom: 12, filter: 'drop-shadow(0 4px 8px rgba(25, 200, 185, 0.3))' }}>🏝️</div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(24px, 5vw, 32px)', color: 'var(--ac-text-header, #794f27)' }}>
            EchoSub
            <Text type="secondary" style={{ fontSize: 16, fontWeight: 400, marginLeft: 12 }}>
              v0.7.0
            </Text>
          </Title>
          <Paragraph style={{ color: 'var(--ac-text-secondary, #9f927d)', fontSize: 15, marginTop: 12, maxWidth: 600, margin: '12px auto 0' }}>
            语言学习与课文背诵的自主托管 Web 应用。
            把视频/音频 + 字幕文件放入目录，自动识别专辑，提供逐句复读、TTS 朗读、
            学习进度跟踪等功能，让语言学习更高效有趣。
          </Paragraph>
          <Space wrap style={{ marginTop: 16, justifyContent: 'center' }}>
            <Tag color="orange" style={{ borderRadius: 12, fontWeight: 600 }}>🚀 自托管</Tag>
            <Tag color="green" style={{ borderRadius: 12, fontWeight: 600 }}>🔒 隐私优先</Tag>
            <Tag color="blue" style={{ borderRadius: 12, fontWeight: 600 }}>🎨 4 套主题</Tag>
            <Tag color="purple" style={{ borderRadius: 12, fontWeight: 600 }}>📱 响应式设计</Tag>
            <Tag color="cyan" style={{ borderRadius: 12, fontWeight: 600 }}>🌗 深色模式</Tag>
            <Tag color="magenta" style={{ borderRadius: 12, fontWeight: 600 }}>🏝️ 动森风格</Tag>
          </Space>
        </div>
      </Card>

      {/* 核心功能 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <StarFilled style={{ color: '#FAAD14', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>核心功能</Title>
        </div>
        <Row gutter={[16, 16]}>
          {features.map((f) => (
            <Col key={f.title} xs={24} sm={12} lg={8}>
              <Card
                style={{
                  borderRadius: 18,
                  border: 'none',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  height: '100%',
                  background: 'var(--color-bg-elevated, #fff)',
                }}
                hoverable
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>{f.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)', marginBottom: 6 }}>
                  {f.title}
                </div>
                <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 13, lineHeight: 1.7 }}>
                  {f.desc}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* 使用方法 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>使用方法</Title>
        </div>
        <Row gutter={[12, 12]}>
          {steps.map((s) => (
            <Col key={s.num} xs={24} sm={12} md={8}>
              <Card
                size="small"
                style={{
                  borderRadius: 14,
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  height: '100%',
                  textAlign: 'center',
                  background: 'var(--color-bg-elevated, #fff)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: `linear-gradient(135deg, color-mix(in srgb, var(--ant-color-primary) 12%, transparent), color-mix(in srgb, var(--ant-color-primary) 20%, transparent))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px',
                  fontWeight: 800, color: 'var(--ant-color-primary)', fontSize: 16,
                }}>
                  {s.num}
                </div>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--color-text-primary, #1a1a1a)' }}>{s.title}</div>
                <div style={{ color: 'var(--color-text-tertiary, #8c8c8c)', fontSize: 12, lineHeight: 1.6 }}>{s.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* 技术栈 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <HeartFilled style={{ color: '#EB2F96', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>技术栈</Title>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Go 1.26', 'Gin', 'GORM', 'SQLite', 'JWT', 'React 19', 'TypeScript', 'Vite', 'Ant Design', 'Zustand', 'Docker'].map((t) => (
            <Tag key={t} color="blue" style={{ borderRadius: 8, padding: '2px 10px' }}>{t}</Tag>
          ))}
        </div>
      </div>

      <Divider />

      {/* 作者信息 */}
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>👨‍💻</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--color-text-primary, #1a1a1a)' }}>作者：tabortao</div>
        <div style={{ color: 'var(--color-text-tertiary, #8c8c8c)', fontSize: 13, marginBottom: 12 }}>
          用 ❤️ 为语言学习者打造
        </div>
        <Space>
          <a href="https://github.com/tabortao/EchoSub" target="_blank" rel="noreferrer" style={{ color: 'var(--ant-color-primary)' }}>
            <GithubOutlined /> GitHub
          </a>
        </Space>
      </div>
    </div>
  )
}
