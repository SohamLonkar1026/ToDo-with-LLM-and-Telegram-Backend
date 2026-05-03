import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.warn("Unauthorized request - 401");
            // Do NOT automatically remove token. Let the UI handle it or user explicitly logout.
            // localStorage.removeItem('token'); 
        }
        return Promise.reject(error);
    }
);

export default api;
