import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const WishlistContext = createContext();

const wishlistReducer = (state, action) => {
  switch (action.type) {
    case 'SET_WISHLIST':
      return { ...state, items: action.payload };

    case 'ADD_TO_WISHLIST':
      // ✅ FIX: So sánh cả _id và id
      const newItemId = action.payload._id || action.payload.id;
      if (state.items.find(item => {
        const itemId = item._id || item.id;
        return String(itemId) === String(newItemId);
      })) {
        return state;
      }
      return { ...state, items: [...state.items, action.payload] };

    case 'REMOVE_FROM_WISHLIST':
      // ✅ FIX: So sánh cả _id và id
      const removeId = action.payload._id || action.payload.id;
      return { 
        ...state, 
        items: state.items.filter(item => {
          const itemId = item._id || item.id;
          return String(itemId) !== String(removeId);
        })
      };

    case 'CLEAR_WISHLIST':
      return { ...state, items: [] };

    default:
      return state;
  }
};

const initialState = { items: [] };

export const WishlistProvider = ({ children }) => {
  const [state, dispatch] = useReducer(wishlistReducer, initialState);
  const { isAuthenticated, token } = useAuth();

  // Load initial items from localStorage immediately on mount
  useEffect(() => {
    const savedWishlist = localStorage.getItem('amiri-wishlist');
    if (savedWishlist) {
      try {
        const parsed = JSON.parse(savedWishlist);
        if (Array.isArray(parsed) && parsed.length > 0) {
          dispatch({ type: 'SET_WISHLIST', payload: parsed });
        }
      } catch (error) {
        console.error('Error parsing wishlist from localStorage:', error);
      }
    }
  }, []);

  // Fetch from server when authenticated, while preserving existing items if server is empty
  useEffect(() => {
    if (isAuthenticated && token) {
      loadWishlist();
    }
  }, [isAuthenticated, token]);

  // Always keep localStorage synchronized with state.items
  useEffect(() => {
    try {
      localStorage.setItem('amiri-wishlist', JSON.stringify(state.items));
    } catch (err) {
      console.error('Error saving wishlist to localStorage:', err);
    }
  }, [state.items]);

  const loadWishlist = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users/wishlist', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const serverItems = data.wishlist || [];
        if (serverItems.length > 0) {
          dispatch({ type: 'SET_WISHLIST', payload: serverItems });
        } else {
          // If server wishlist is empty, preserve localStorage items if present
          const savedWishlist = localStorage.getItem('amiri-wishlist');
          if (savedWishlist) {
            try {
              const parsed = JSON.parse(savedWishlist);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dispatch({ type: 'SET_WISHLIST', payload: parsed });
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error('Error loading wishlist:', error);
    }
  }, [token]);

  const addToWishlist = useCallback(async (product) => {
    // ✅ FIX: Ưu tiên _id từ MongoDB
    const safeId = product._id || product.id || `${product.name || "unknown"}-${product.category || "misc"}-${product.price || 0}`;
    const productWithId = { ...product, id: safeId, _id: product._id };

    dispatch({ type: 'ADD_TO_WISHLIST', payload: productWithId });

    if (isAuthenticated && token) {
      try {
        const response = await fetch('http://localhost:5000/api/users/wishlist/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ productId: safeId })
        });

        if (!response.ok) {
          console.error('Add to wishlist failed');
        } else {
          await loadWishlist();
        }
      } catch (error) {
        console.error('Error adding to wishlist:', error);
      }
    }
  }, [isAuthenticated, token, loadWishlist]);

  const removeFromWishlist = useCallback(async (product) => {
    // ✅ FIX: Đảm bảo pass đúng product object
    dispatch({ type: 'REMOVE_FROM_WISHLIST', payload: product });

    if (isAuthenticated && token) {
      try {
        const productId = product._id || product.id;
        const response = await fetch('http://localhost:5000/api/users/wishlist/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ productId })
        });

        if (!response.ok) {
          console.error('Remove from wishlist failed');
        } else {
          await loadWishlist();
        }
      } catch (error) {
        console.error('Error removing from wishlist:', error);
      }
    }
  }, [isAuthenticated, token, loadWishlist]);

  const isInWishlist = useCallback((productId) => {
    if (productId == null) return false;
    return state.items.some(item => {
      const itemId = item._id || item.id;
      return String(itemId) === String(productId);
    });
  }, [state.items]);

  const clearWishlist = useCallback(async () => {
    dispatch({ type: 'CLEAR_WISHLIST' });

    if (!isAuthenticated) {
      localStorage.removeItem('amiri-wishlist');
    } else if (token) {
      try {
        const response = await fetch('http://localhost:5000/api/users/wishlist/clear', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          await loadWishlist();
        }
      } catch (error) {
        console.error('Error clearing wishlist:', error);
      }
    }
  }, [isAuthenticated, token, loadWishlist]);

  const value = useMemo(() => ({
    items: state.items,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    clearWishlist
  }), [state.items, addToWishlist, removeFromWishlist, isInWishlist, clearWishlist]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within WishlistProvider');
  return context;
};