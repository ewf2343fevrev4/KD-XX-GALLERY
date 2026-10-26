import React, { createContext, useContext, useReducer, useEffect } from 'react';

const CartContext = createContext();

// Cart reducer để quản lý state
const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const existingItem = state.items.find(item => item.id === action.payload.id);
      const addQuantity = Number(action.payload.quantity) || 1;

      if (existingItem) {
        // Nếu sản phẩm đã có, tăng quantity theo payload
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: item.quantity + addQuantity }
              : item
          )
        };
      } else {
        // Nếu sản phẩm chưa có, thêm mới với quantity
        return {
          ...state,
          items: [...state.items, { ...action.payload, quantity: addQuantity }]
        };
      }
    }

    case 'REMOVE_FROM_CART':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload.id)
      };

    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items
          .map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: action.payload.quantity }
              : item
          )
          .filter(item => item.quantity > 0)
      };

    case 'CLEAR_CART':
      return {
        ...state,
        items: []
      };

    case 'TOGGLE_CART':
      return {
        ...state,
        isOpen: !state.isOpen
      };

    case 'LOAD_CART':
      return {
        ...state,
        items: action.payload || []
      };

    default:
      return state;
  }
};

// Initial state
const initialState = {
  items: [],
  isOpen: false
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  // Load cart từ localStorage khi component mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('amiri-cart');
      if (savedCart) {
        const cartData = JSON.parse(savedCart);
        dispatch({ type: 'LOAD_CART', payload: cartData });
      }
    } catch (error) {
      console.error('Error loading cart from localStorage:', error);
    }
  }, []);

  // Save cart to localStorage khi state thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('amiri-cart', JSON.stringify(state.items));
    } catch (error) {
      console.error('Error saving cart to localStorage:', error);
    }
  }, [state.items]);

  // Cart actions
  const addToCart = (product) => {
    // Tạo ID duy nhất phân biệt theo kích cỡ và màu sắc nếu có
    const baseId = product._id || product.id || `${product.name || "unknown"}-${product.category || "misc"}`;
    const variantSuffix = [product.size, product.color].filter(Boolean).join('-');
    const safeId = variantSuffix ? `${baseId}-${variantSuffix}` : (product.id || baseId);

    const productWithId = {
      ...product,
      id: safeId,
      productId: product._id || product.id || baseId,
      quantity: Number(product.quantity) || 1
    };

    dispatch({ type: 'ADD_TO_CART', payload: productWithId });
  };

  const removeFromCart = (productId) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: { id: productId } });
  };

  const updateQuantity = (productId, quantity) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { id: productId, quantity } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const toggleCart = () => {
    dispatch({ type: 'TOGGLE_CART' });
  };

  // Calculate totals
  const getTotalItems = () => {
    return state.items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return state.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const value = {
    items: state.items,
    isOpen: state.isOpen,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    toggleCart,
    getTotalItems,
    getTotalPrice
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
