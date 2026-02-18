import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
    token: string | null;
    login: (token: string, email: string) => void;
    logout: () => void;
    userEmail: string | null;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('userEmail'));

    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }, [token]);

    useEffect(() => {
        if (userEmail) {
            localStorage.setItem('userEmail', userEmail);
        } else {
            localStorage.removeItem('userEmail');
        }
    }, [userEmail]);

    const login = (newToken: string, email: string) => {
        setToken(newToken);
        setUserEmail(email);
    };

    const logout = () => {
        setToken(null);
        setUserEmail(null);
    };

    return (
        <AuthContext.Provider value={{ token, login, logout, userEmail, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
