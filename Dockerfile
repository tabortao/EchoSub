# ===== Stage 1: 构建后端 =====
# 使用 golang:1.26-alpine 匹配 go.mod 声明（go 1.25.0 + toolchain go1.26.4）
# 避免依赖运行时 toolchain 自动下载（多架构构建时更稳定）
FROM golang:1.26-alpine AS backend-builder

# 安装 git（go mod 需要）
RUN apk add --no-cache git

WORKDIR /build

# 关闭 toolchain 自动下载，使用镜像自带的 1.26 工具链
ENV GOTOOLCHAIN=local

# 先复制 go.mod/go.sum 利用缓存
COPY backend/go.mod backend/go.sum* ./
RUN go mod download

# 复制后端源码并编译
# CGO_ENABLED=0 纯静态编译，方便多架构
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /echosub-server ./cmd/server

# ===== Stage 2: 构建前端 =====
FROM node:22-alpine AS frontend-builder

WORKDIR /build

# 使用 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 先复制依赖文件利用缓存
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# 复制前端源码并构建
COPY frontend/ ./
RUN pnpm build

# ===== Stage 3: 最终运行镜像 =====
FROM alpine:3.20

# 安装 ffmpeg（用于媒体时长提取/首帧封面）和 ca-certificates tzdata
RUN apk add --no-cache ffmpeg ca-certificates tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 拷贝后端二进制
COPY --from=backend-builder /echosub-server /app/echosub-server

# 拷贝前端静态资源
COPY --from=frontend-builder /build/dist /app/frontend/dist

# 数据目录
RUN mkdir -p /app/data

ENV ECHOSUB_PORT=8080
ENV ECHOSUB_DB_PATH=/app/data/echosub.db
ENV ECHOSUB_MEDIA_DIR=/media
ENV GIN_MODE=release

EXPOSE 8080

# 声明数据卷（SQLite 数据库 + 媒体文件）
VOLUME ["/app/data", "/media"]

ENTRYPOINT ["/app/echosub-server"]
