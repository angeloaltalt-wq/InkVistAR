import React, { useState, useEffect, useMemo } from 'react';
import Axios from 'axios';
import { ShoppingCart, Search, Plus, Minus, Trash2, Receipt, Package, CheckCircle, X, RefreshCw, Filter } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import { API_URL } from '../config';
import './AdminPOS.css';

function AdminPOS() {
    const [inventory, setInventory] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastOrder, setLastOrder] = useState(null);
    const [activeCategory, setActiveCategory] = useState('All');
    const [error, setError] = useState(null);

    useEffect(() => {
        console.log("🛒 POS System Mounting...");
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        if (!API_URL) return setError("Configuration Error: API_URL is missing.");
        try {
            setLoading(true);
            setError(null);
            const response = await Axios.get(`${API_URL}/api/admin/inventory?status=active`);
            if (response.data.success) {
                setInventory(response.data.data);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching inventory:", error);
            setError("Failed to load inventory. Please check your connection.");
            setLoading(false);
        }
    };

    const addToCart = (item) => {
        const existing = cart.find(c => c.id === item.id);
        if (existing) {
            if (existing.quantity >= item.current_stock) {
                alert("Cannot add more. Insufficient stock.");
                return;
            }
            setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
        } else {
            if (item.current_stock <= 0) {
                alert("Item out of stock.");
                return;
            }
            setCart([...cart, { ...item, quantity: 1 }]);
        }
    };

    const updateQuantity = (id, delta) => {
        setCart(cart.map(c => {
            if (c.id === id) {
                const newQty = c.quantity + delta;
                if (newQty <= 0) return c;
                if (newQty > c.current_stock) {
                    alert("Insufficient stock.");
                    return c;
                }
                return { ...c, quantity: newQty };
            }
            return c;
        }));
    };

    const removeFromCart = (id) => {
        setCart(cart.filter(c => c.id !== id));
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.cost * item.quantity), 0);

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        
        setIsCheckingOut(true);
        try {
            const promises = cart.map(item => 
                Axios.post(`${API_URL}/api/admin/inventory/${item.id}/transaction`, {
                    type: 'out',
                    quantity: item.quantity,
                    reason: 'POS Sale'
                })
            );
            
            await Promise.all(promises);
            
            setLastOrder({
                items: [...cart],
                total: cartTotal,
                date: new Date().toLocaleString(),
                orderId: Math.floor(Math.random() * 1000000)
            });
            
            setCart([]);
            setShowReceipt(true);
            fetchInventory(); // Refresh stock
        } catch (error) {
            console.error("Checkout failed:", error);
            alert("Checkout failed. Please try again.");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const categories = useMemo(() => {
        return ['All', ...new Set((inventory || []).map(item => item?.category).filter(Boolean))];
    }, [inventory]);

    const filteredInventory = useMemo(() => {
        return Array.isArray(inventory) ? inventory.filter(item => {
            if (!item) return false;
            const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
                                 (item.category || '').toLowerCase().includes((searchTerm || '').toLowerCase());
            const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
            return matchesSearch && matchesCategory;
        }) : [];
    }, [inventory, searchTerm, activeCategory]);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page pos-container page-container-enter">
                <div className="pos-layout">
                    <div className="pos-main">
                        <header className="pos-header">
                            <h1>POS System</h1>
                            <div className="pos-search">
                                <Search size={20} />
                                <input 
                                    type="text" 
                                    placeholder="Search products..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button className="refresh-pos-btn" onClick={fetchInventory} title="Refresh Inventory">
                                <RefreshCw size={20} className={loading ? 'spinning' : ''} />
                            </button>
                        </header>

                        <div className="pos-categories">
                            {categories.map(cat => (
                                <button 
                                    key={cat} 
                                    className={`cat-pill ${activeCategory === cat ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {error && <div className="pos-error-msg">{error}</div>}

                        <div className="pos-grid">
                            {loading ? (
                                <div className="pos-loader">Loading products...</div>
                            ) : filteredInventory.length > 0 ? filteredInventory.map(item => (
                                <div 
                                    key={item.id} 
                                    className={`pos-card ${item.current_stock <= 0 ? 'out-of-stock' : ''}`} 
                                    onClick={() => item.current_stock > 0 && addToCart(item)}
                                >
                                    <div className="pos-card-icon">
                                        <Package size={24} />
                                    </div>
                                    <div className="pos-card-info">
                                        <h3>{item.name}</h3>
                                        <span className="pos-category">{item.category}</span>
                                        <div className="pos-card-footer">
                                            <span className="pos-price">₱{Number(item.cost).toLocaleString()}</span>
                                            <span className={`pos-stock ${item.current_stock <= item.min_stock ? 'low' : ''}`}>
                                                {item.current_stock} {item.unit}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="pos-no-items">
                                    <Filter size={48} />
                                    <p>No products found matching your search</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pos-sidebar">
                        <div className="cart-container">
                            <div className="cart-header">
                                <ShoppingCart size={20} />
                                <h2>Current Order</h2>
                                <span className="cart-count">{cart.length} items</span>
                            </div>

                            <div className="cart-items">
                                {cart.length === 0 ? (
                                    <div className="empty-cart">
                                        <Package size={48} />
                                        <p>Your cart is empty</p>
                                    </div>
                                ) : cart.map(item => (
                                    <div key={item.id} className="cart-item">
                                        <div className="cart-item-info">
                                            <h4>{item.name}</h4>
                                            <span>₱{Number(item.cost).toLocaleString()}</span>
                                        </div>
                                        <div className="cart-item-actions">
                                            <div className="qty-controls">
                                                <button onClick={() => updateQuantity(item.id, -1)}><Minus size={14} /></button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.id, 1)}><Plus size={14} /></button>
                                            </div>
                                            <button className="remove-btn" onClick={() => removeFromCart(item.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="cart-footer">
                                <div className="cart-summary">
                                    <div className="summary-row">
                                        <span>Subtotal</span>
                                        <span>₱{cartTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="summary-row total">
                                        <span>Total</span>
                                        <span>₱{cartTotal.toLocaleString()}</span>
                                    </div>
                                </div>
                                <button 
                                    className="checkout-btn" 
                                    disabled={cart.length === 0 || isCheckingOut}
                                    onClick={handleCheckout}
                                >
                                    {isCheckingOut ? 'Processing...' : 'Complete Sale'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {showReceipt && lastOrder && (
                    <div className="pos-modal-overlay">
                        <div className="receipt-modal">
                            <div className="receipt-header">
                                <CheckCircle size={48} color="#10b981" />
                                <h2>Sale Successful!</h2>
                                <span>Order #{lastOrder.orderId}</span>
                            </div>
                            <div className="receipt-body">
                                {lastOrder.items.map(item => (
                                    <div key={item.id} className="receipt-row">
                                        <span>{item.name} x {item.quantity}</span>
                                        <span>₱{(item.cost * item.quantity).toLocaleString()}</span>
                                    </div>
                                ))}
                                <div className="receipt-total">
                                    <span>Total Amount</span>
                                    <span>₱{lastOrder.total.toLocaleString()}</span>
                                </div>
                            </div>
                            <button className="close-receipt-btn" onClick={() => setShowReceipt(false)}>Close</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminPOS;