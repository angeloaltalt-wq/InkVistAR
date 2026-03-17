import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Edit2, Trash2, Package, History, ArrowUpCircle, ArrowDownCircle, X, RotateCcw, Printer, Download } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import './AdminInventory.css';
import ManagerSideNav from '../components/ManagerSideNav';
import { API_URL } from '../config';

function AdminInventory() {
    const navigate = useNavigate();
    const location = useLocation();
    const isManagerView = location.pathname.startsWith('/manager');
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filteredInventory, setFilteredInventory] = useState(inventory);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [itemStatusFilter, setItemStatusFilter] = useState('active');
    const [stockStatusFilter, setStockStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [selectedItem, setSelectedItem] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    // State for modals to handle animations
    const [addEditModal, setAddEditModal] = useState({ mounted: false, visible: false });
    const [transactionModal, setTransactionModal] = useState({ mounted: false, visible: false });
    const [historyModal, setHistoryModal] = useState({ mounted: false, visible: false });

    const [transactions, setTransactions] = useState([]);
    const [transactionError, setTransactionError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        category: 'ink',
        currentStock: 0,
        minStock: 0,
        maxStock: 0,
        unit: 'pcs',
        supplier: '',
        cost: 0
    });
    const [transactionData, setTransactionData] = useState({
        type: 'in',
        quantity: 0,
        reason: ''
    });

    // Modal animation handlers
    const openModal = (setter) => {
        setter({ mounted: true, visible: false });
        setTimeout(() => setter({ mounted: true, visible: true }), 10);
    };

    const closeModal = (setter) => {
        setter(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setter({ mounted: false, visible: false });
            setSelectedItem(null); // Reset selected item when any modal closes
        }, 400); // Must match CSS transition duration
    };

    useEffect(() => {
        fetchInventory();
    }, [itemStatusFilter]);

    useEffect(() => {
        filterAndSortInventory();
    }, [inventory, searchTerm, categoryFilter, stockStatusFilter, sortBy]);

    const fetchInventory = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/admin/inventory?status=${itemStatusFilter}`);
            if (res.data && res.data.success && Array.isArray(res.data.data)) {
                // Map backend fields to frontend state if needed, but they match mostly
                const mapped = res.data.data.map(i => ({
                    ...i,
                    currentStock: i.current_stock,
                    minStock: i.min_stock,
                    maxStock: i.max_stock,
                    lastRestocked: i.last_restocked
                }));
                setInventory(mapped);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching inventory:", error);
            setLoading(false);
        }
    };

    const filterAndSortInventory = () => {
        let filtered = inventory.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.supplier.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
            
            let matchesStockStatus = true;
            if (stockStatusFilter === 'out_of_stock') {
                matchesStockStatus = item.currentStock === 0;
            } else if (stockStatusFilter === 'low') {
                matchesStockStatus = item.currentStock > 0 && item.currentStock <= item.minStock;
            } else if (stockStatusFilter === 'optimal') {
                matchesStockStatus = item.currentStock > item.minStock && item.currentStock <= item.maxStock;
            } else if (stockStatusFilter === 'overstock') {
                matchesStockStatus = item.currentStock > item.maxStock;
            }
            
            return matchesSearch && matchesCategory && matchesStockStatus;
        });

        // Sort
        if (sortBy === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === 'stock') {
            filtered.sort((a, b) => a.currentStock - b.currentStock);
        } else if (sortBy === 'category') {
            filtered.sort((a, b) => a.category.localeCompare(b.category));
        }

        setFilteredInventory(filtered);
    };

    // Pagination logic
    const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedInventory = filteredInventory.slice(startIndex, endIndex);

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        const headers = ['Item Name', 'Category', 'Current Stock', 'Min Stock', 'Max Stock', 'Unit', 'Supplier', 'Cost', 'Status'];
        const csvData = filteredInventory.map(item => [
            item.name,
            item.category,
            item.currentStock,
            item.minStock,
            item.maxStock,
            item.unit,
            item.supplier || '',
            item.cost,
            getStockStatus(item.currentStock, item.minStock, item.maxStock)
        ]);

        const csvContent = [
            headers.join(','),
            ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const getStockStatus = (current, min, max) => {
        if (current === 0) return 'out_of_stock';
        if (current <= min) return 'low';
        if (current > max) return 'overstock';
        return 'optimal';
    };

    const handleEdit = (item) => {
        setSelectedItem(item);
        setFormData({
            name: item.name,
            category: item.category,
            currentStock: item.currentStock,
            minStock: item.minStock,
            maxStock: item.maxStock,
            unit: item.unit,
            supplier: item.supplier,
            cost: item.cost
        });
        openModal(setAddEditModal);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                await Axios.delete(`${API_URL}/api/admin/inventory/${id}`);
                fetchInventory();
            } catch (error) {
                console.error("Error deleting item:", error);
            }
        }
    };

    const handleRestore = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/admin/inventory/${id}/restore`);
            fetchInventory();
        } catch (error) {
            console.error("Error restoring item:", error);
        }
    };

    const handlePermanentDelete = async (id) => {
        if (window.confirm('This will PERMANENTLY delete the item. Continue?')) {
            try {
                await Axios.delete(`${API_URL}/api/admin/inventory/${id}/permanent`);
                fetchInventory();
            } catch (error) {
                console.error("Error deleting item:", error);
            }
        }
    };

    const handleAddNew = () => {
        setSelectedItem(null);
        setFormData({
            name: '',
            category: 'ink',
            currentStock: 0,
            minStock: 0,
            maxStock: 0,
            unit: 'pcs',
            supplier: '',
            cost: 0
        });
        openModal(setAddEditModal);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (isSaving) return;

        if (!formData.name.trim()) {
            alert("Item name is required");
            return;
        }

        // Validate for negative numbers
        if (Number(formData.currentStock) < 0 || Number(formData.minStock) < 0 || Number(formData.maxStock) < 0 || Number(formData.cost) < 0) {
            alert("Stock and cost values cannot be negative.");
            return;
        }

        setIsSaving(true);
        try {
            // Ensure numbers are valid before sending
            const payload = {
                ...formData,
                currentStock: Number(formData.currentStock) || 0,
                minStock: Number(formData.minStock) || 0,
                maxStock: Number(formData.maxStock) || 0,
                cost: Number(formData.cost) || 0
            };

            if (selectedItem) {
                await Axios.put(`${API_URL}/api/admin/inventory/${selectedItem.id}`, payload);
                alert('Item updated successfully');
            } else {
                await Axios.post(`${API_URL}/api/admin/inventory`, payload);
                alert('Item added successfully');
            }
            closeModal(setAddEditModal);
            fetchInventory();
        } catch (error) {
            console.error("Error saving item:", error);
            alert("Failed to save item: " + (error.response?.data?.message || error.message));
        } finally {
            setIsSaving(false);
        }
    };

    const openTransactionModal = (item, type) => {
        setSelectedItem(item);
        setTransactionData({
            type: type,
            quantity: 1,
            reason: type === 'in' ? 'Restock' : 'Session Usage'
        });
        setTransactionError('');
        openModal(setTransactionModal);
    };

    const handleTransaction = async (e) => {
        e.preventDefault();
        setTransactionError('');
        try {
            const quantity = Number(transactionData.quantity);
            if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
                setTransactionError("Quantity must be a positive whole number.");
                return;
            }

            // Prevent deducting more than available stock
            if (transactionData.type === 'out' && quantity > selectedItem.currentStock) {
                setTransactionError(`Cannot deduct more than the available stock. You have ${selectedItem.currentStock} ${selectedItem.unit} left.`);
                return;
            }

            await Axios.post(`${API_URL}/api/admin/inventory/${selectedItem.id}/transaction`, {
                ...transactionData,
                quantity: quantity
            });
            closeModal(setTransactionModal);
            fetchInventory();
        } catch (error) {
            console.error("Error processing transaction:", error);
            setTransactionError("Transaction failed. Please try again.");
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/inventory/transactions`);
            if (res.data.success) {
                setTransactions(res.data.data);
                openModal(setHistoryModal);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        }
    };

    const lowStockItems = inventory.filter(i => i.currentStock <= i.minStock).length;
    const totalValue = inventory.reduce((sum, i) => sum + (i.currentStock * i.cost), 0);

    return (
        <div className="admin-page-with-sidenav">
            {isManagerView ? <ManagerSideNav /> : <AdminSideNav />}
            <div className="admin-page page-container-enter">
            {/* Print Only Header */}
            <div className="print-only-header">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px'}}>
                    <div>
                        <h1 style={{margin: 0, color: '#000'}}>InkVistAR Studio</h1>
                        <p style={{margin: 0}}>Inventory & Stock Report</p>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <p style={{margin: 0}}>Date: {new Date().toLocaleDateString()}</p>
                        <p style={{margin: 0}}>Total Value: ₱{totalValue.toLocaleString()}</p>
                    </div>
                </div>
            </div>
            <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none', color: '#1f2937' }}>
                <h1>Inventory Management</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={handlePrint} style={{display:'flex', alignItems:'center', gap:'5px'}}>
                        <Printer size={18}/> Print
                    </button>
                    <button className="btn btn-secondary" onClick={handleExportCSV} style={{display:'flex', alignItems:'center', gap:'5px'}}>
                        <Download size={18}/> Export CSV
                    </button>
                    <button className="btn btn-secondary" onClick={fetchHistory} style={{display:'flex', alignItems:'center', gap:'5px'}}>
                        <History size={18}/> History
                    </button>
                    <button className="btn btn-primary" onClick={handleAddNew}>
                        + Add Item
                    </button>
                </div>
            </header>

            <div className="filters-section">
                <div className="search-box" style={{ maxWidth: '300px' }}>
                    <input
                        type="text"
                        placeholder="Search items or suppliers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-controls">
                    <select 
                        value={itemStatusFilter}
                        onChange={(e) => setItemStatusFilter(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="active">Active Items</option>
                        <option value="deleted">Deleted Items</option>
                    </select>

                    <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="all">All Categories</option>
                        <option value="ink">Ink</option>
                        <option value="needles">Needles</option>
                        <option value="jewelry">Jewelry</option>
                        <option value="supplies">Supplies</option>
                        <option value="aftercare">Aftercare</option>
                    </select>

                    <select
                        value={stockStatusFilter}
                        onChange={(e) => setStockStatusFilter(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="all">All Stock Levels</option>
                        <option value="out_of_stock">Out of Stock</option>
                        <option value="low">Low Stock</option>
                        <option value="optimal">Optimal</option>
                        <option value="overstock">Overstock</option>
                    </select>

                    <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="stock">Sort by Stock</option>
                        <option value="category">Sort by Category</option>
                    </select>
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-item">
                    <span className="stat-label">Total Items</span>
                    <span className="stat-count">{inventory.length}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Low Stock</span>
                    <span className="stat-count warning">{lowStockItems}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Total Value</span>
                    <span className="stat-count">₱{totalValue.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Categories</span>
                    <span className="stat-count">{new Set(inventory.map(i => i.category)).size}</span>
                </div>
            </div>

            <div className="table-card">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Category</th>
                                <th>Current Stock</th>
                                <th>Min/Max</th>
                                <th>Unit</th>
                                <th>Supplier</th>
                                <th>Cost</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="9" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading inventory...</td></tr>
                            ) : paginatedInventory.length > 0 ? (
                                paginatedInventory.map((item) => (
                                    <tr key={item.id} className={`status-${getStockStatus(item.currentStock, item.minStock, item.maxStock)}`}>
                                        <td><strong>{item.name}</strong></td>
                                        <td>
                                            <span className={`badge category-${item.category}`}>
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="text-center">{item.currentStock}</td>
                                        <td className="text-center">{item.minStock}/{item.maxStock}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.supplier || '-'}</td>
                                        <td>₱{item.cost}</td>
                                        <td>
                                            <span className={`badge stock-${getStockStatus(item.currentStock, item.minStock, item.maxStock)}`}>
                                                {getStockStatus(item.currentStock, item.minStock, item.maxStock)}
                                            </span>
                                        </td>
                                        <td className="actions-cell">
                                            {itemStatusFilter === 'active' ? (
                                                <>
                                                    <button className="action-btn" style={{backgroundColor: '#10b981'}} onClick={() => openTransactionModal(item, 'in')} title="Stock In">
                                                        <ArrowUpCircle size={16}/>
                                                    </button>
                                                    <button className="action-btn" style={{backgroundColor: '#f59e0b'}} onClick={() => openTransactionModal(item, 'out')} title="Stock Out">
                                                        <ArrowDownCircle size={16}/>
                                                    </button>
                                                    <button className="action-btn edit-btn" onClick={() => handleEdit(item)} title="Edit">
                                                        <Edit2 size={16}/>
                                                    </button>
                                                    <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)} title="Delete">
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="action-btn view-btn" onClick={() => handleRestore(item.id)} style={{backgroundColor: '#10b981'}} title="Restore"><RotateCcw size={16}/></button>
                                                    <button className="action-btn delete-btn" onClick={() => handlePermanentDelete(item.id)} title="Permanent Delete"><Trash2 size={16}/></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="9" className="no-data">No items found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {filteredInventory.length > 0 && (
                <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label>Items per page:</label>
                        <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="select-input" style={{ width: '80px' }}>
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span>Page {currentPage} of {totalPages} ({filteredInventory.length} items)</span>
                        <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
                        <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {addEditModal.mounted && (
                <div className={`modal-overlay ${addEditModal.visible ? 'open' : ''}`} onClick={() => closeModal(setAddEditModal)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedItem ? 'Edit Item' : 'Add New Item'}</h2>
                            <button className="close-btn" onClick={() => closeModal(setAddEditModal)}><X size={20}/></button>
                        </div>
                        <form onSubmit={handleSave}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Item Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Category *</label>
                                    <select 
                                        value={formData.category}
                                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                                        className="form-input"
                                    >
                                        <option value="ink">Ink</option>
                                        <option value="needles">Needles</option>
                                        <option value="jewelry">Jewelry</option>
                                        <option value="supplies">Supplies</option>
                                        <option value="aftercare">Aftercare</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Unit *</label>
                                    <input
                                        type="text"
                                        value={formData.unit}
                                        onChange={(e) => setFormData({...formData, unit: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Current Stock *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.currentStock}
                                        onChange={(e) => setFormData({...formData, currentStock: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Min Stock *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.minStock}
                                        onChange={(e) => setFormData({...formData, minStock: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Max Stock *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.maxStock}
                                        onChange={(e) => setFormData({...formData, maxStock: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Supplier</label>
                                    <input
                                        type="text"
                                        value={formData.supplier}
                                        onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cost per Unit</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.cost}
                                        onChange={(e) => setFormData({...formData, cost: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => closeModal(setAddEditModal)} disabled={isSaving}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save Item'}
                            </button>
                        </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {transactionModal.mounted && (
                <div className={`modal-overlay ${transactionModal.visible ? 'open' : ''}`} onClick={() => closeModal(setTransactionModal)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{transactionData.type === 'in' ? 'Stock In (Restock)' : 'Stock Out (Usage)'}</h2>
                            <button className="close-btn" onClick={() => closeModal(setTransactionModal)}><X size={20}/></button>
                        </div>
                        <form onSubmit={handleTransaction}>
                            <div className="modal-body">
                                {transactionError && <p style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem', background: '#fee2e2', padding: '0.5rem', borderRadius: '6px' }}>{transactionError}</p>}
                                <p><strong>Item:</strong> {selectedItem?.name}</p>
                                <p><strong>Current Stock:</strong> {selectedItem?.currentStock} {selectedItem?.unit}</p>
                                <div className="form-group" style={{marginTop: '15px'}}>
                                    <label>Quantity *</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        min="1" 
                                        max={transactionData.type === 'out' ? selectedItem?.currentStock : undefined}
                                        required 
                                        value={transactionData.quantity} 
                                        onChange={e => { setTransactionData({...transactionData, quantity: e.target.value}); setTransactionError(''); }} 
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Reason / Reference</label>
                                    <input type="text" className="form-input" placeholder={transactionData.type === 'in' ? 'e.g. Order #123' : 'e.g. Session #456'} value={transactionData.reason} onChange={e => setTransactionData({...transactionData, reason: e.target.value})} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => closeModal(setTransactionModal)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {historyModal.mounted && (
                <div className={`modal-overlay ${historyModal.visible ? 'open' : ''}`} onClick={() => closeModal(setHistoryModal)}>
                    <div className="modal-content" style={{maxWidth: '800px'}} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Inventory Transaction History</h2>
                            <button className="close-btn" onClick={() => closeModal(setHistoryModal)}><X size={20}/></button>
                        </div>
                        <div className="modal-body" style={{maxHeight: '60vh', overflowY: 'auto'}}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Item</th>
                                        <th>Type</th>
                                        <th>Qty</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map(t => (
                                        <tr key={t.id}>
                                            <td>{new Date(t.created_at).toLocaleString()}</td>
                                            <td>{t.item_name}</td>
                                            <td><span className={`badge status-${t.type === 'in' ? 'active' : 'inactive'}`}>{t.type.toUpperCase()}</span></td>
                                            <td>{t.quantity}</td>
                                            <td>{t.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

export default AdminInventory;
