import axios, { type AxiosInstance } from 'axios'

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器：附加 JWT
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('echosub_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('echosub_token')
      localStorage.removeItem('echosub_user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default client
