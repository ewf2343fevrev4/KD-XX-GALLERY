import React, { createContext, useContext, useReducer, useEffect } from 'react';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        loading: false,
        error: null
      };

    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        error: null
      };

    case 'AUTH_ERROR':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        error: action.payload
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };

    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload
      };

    default:
      return state;
  }
};

const initialState = {
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: true,
  error: null
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      verifyToken(token);
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/users/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('user', JSON.stringify(data.user));
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: data.user, token }
        });
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const login = async (email, password) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await fetch('http://localhost:5000/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      console.log('🔐 Login response:', data);

      if (response.ok) {
        // ✅ FIX: Xử lý đúng structure từ backend
        const userData = data.user || {
          _id: data._id,
          name: data.name,
          email: data.email,
          role: data.role,
          phone: data.phone || '',
          address: data.address || '',
          birthDate: data.birthDate || '',
          gender: data.gender || ''
        };
        
        console.log('👤 User data extracted:', userData);
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(userData));
        
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: userData, token: data.token }
        });
        
        return { success: true, user: userData };
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: data.message });
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      dispatch({ type: 'AUTH_ERROR', payload: 'Network error' });
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (name, email, password) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await fetch('http://localhost:5000/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Register trả về flat object
        const userData = {
          _id: data._id,
          name: data.name,
          email: data.email,
          role: data.role || 'user',
          phone: data.phone || '',
          address: data.address || '',
          birthDate: data.birthDate || '',
          gender: data.gender || ''
        };
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(userData));
        
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: userData, token: data.token }
        });
        
        return { success: true, user: userData };
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: data.message });
        return { success: false, error: data.message };
      }
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: 'Network error' });
      return { success: false, error: 'Network error' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch({ type: 'LOGOUT' });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const updateUserProfile = async (updatedData) => {
    try {
      const response = await fetch('http://localhost:5000/api/users/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(updatedData)
      });

      const data = await response.json();

      if (response.ok) {
        const updatedUser = { ...state.user, ...data };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        dispatch({ type: 'UPDATE_USER', payload: updatedUser });
        return { success: true, user: updatedUser };
      } else {
        return { success: false, error: data.message };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const setUser = (userData) => {
    console.log('🔄 setUser called with:', userData);
    localStorage.setItem('user', JSON.stringify(userData));
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const loginWithSocial = (token, userData) => {
    console.log('🌐 Social login success:', userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user: userData, token }
    });
    return { success: true, user: userData };
  };

  const value = {
    ...state,
    login,
    register,
    loginWithSocial,
    logout,
    clearError,
    updateUserProfile,
    setUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};