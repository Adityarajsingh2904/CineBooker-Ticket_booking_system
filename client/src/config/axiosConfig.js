import axios from 'axios'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // frontend env variable
  withCredentials: true // if you’re using cookies/JWT
})

export default instance
