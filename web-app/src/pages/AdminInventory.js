import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Edit2, Trash2, Package, History, ArrowUpCircle, ArrowDownCircle, X, RotateCcw, Printer, Download, Search, Filter, SlidersHorizontal, AlertTriangle, Layers, Clock, User, Inbox } from 'lucide-react';
import { filterMoney, clampNumber } from '../utils/validation';
import PhilippinePeso from '../components/PhilippinePeso';

import AdminSideNav from '../components/AdminSideNav';
import './AdminInventory.css';
import './PortalStyles.css';
import './AdminStyles.css';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import ImageCropper from '../components/ImageCropper';
import CustomSelect from '../components/CustomSelect';
import { API_URL } from '../config';
import { generateReportHeader, downloadCsv } from '../utils/csvExport';

const INVENTORY_CATEGORIES = [
    { value: 'ink', label: 'Ink' },
    { value: 'needles', label: 'Needles' },
    { value: 'jewelry', label: 'Jewelry' },
    { value: 'supplies', label: 'Supplies' },
    { value: 'aftercare', label: 'Aftercare' },
    { value: 'machinery', label: 'Machinery' }
];

function AdminInventory() {
    const navigate = useNavigate();
    const location = useLocation();
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filteredInventory, setFilteredInventory] = useState(inventory);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);
    
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [itemStatusFilter, setItemStatusFilter] = useState('active');
    const [stockStatusFilter, setStockStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [selectedItem, setSelectedItem] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    // State for modals to handle animations
    const [addEditModal, setAddEditModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        onConfirm: null, 
        type: 'danger', 
        isAlert: false 
    });
    const [transactionModal, setTransactionModal] = useState({ mounted: false, visible: false });
    const [historyModal, setHistoryModal] = useState({ mounted: false, visible: false });
    const [serviceKitsModal, setServiceKitsModal] = useState({ mounted: false, visible: false });

    const [transactions, setTransactions] = useState([]);
    const [serviceKits, setServiceKits] = useState({});
    const [editingKitServiceType, setEditingKitServiceType] = useState('');
    const [editingKitOriginalType, setEditingKitOriginalType] = useState('');
    const [editingKitMaterials, setEditingKitMaterials] = useState([]);
    const [transactionError, setTransactionError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const adminUser = JSON.parse(localStorage.getItem('user') || '{}');

    // Validation state
    const [errors, setErrors] = useState({});

    const validateInventoryField = (field, value) => {
        let errorMsg = "";
        if (field === 'name' && (!value || !value.trim())) errorMsg = "Name is required";
        if (field === 'unit' && (!value || !value.trim())) errorMsg = "Unit is required";
        if (['currentStock', 'minStock', 'maxStock', 'cost', 'retailPrice'].includes(field) && Number(value) < 0) {
            errorMsg = "Cannot be negative";
        }
        setErrors(prev => ({ ...prev, [field]: errorMsg }));
        return errorMsg === "";
    };

    const handleInventoryInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        validateInventoryField(field, value);
    };

    const validateTransactionField = (field, value) => {
        let errorMsg = "";
        if (field === 'quantity' && (!value || Number(value) < 1 || !Number.isInteger(Number(value)))) {
            errorMsg = "Must be a positive whole number";
        }
        setErrors(prev => ({ ...prev, [`tx_${field}`]: errorMsg }));
        return errorMsg === "";
    };

    const handleTransactionInputChange = (field, value) => {
        setTransactionData(prev => ({ ...prev, [field]: value }));
        validateTransactionField(field, value);
    };

    const validateKitField = (value) => {
        let errorMsg = "";
        if (!value || !value.trim()) errorMsg = "Service type is required";
        setErrors(prev => ({ ...prev, kit_name: errorMsg }));
        return errorMsg === "";
    };

    // History modal filter state
    const [historySearch, setHistorySearch] = useState('');
    const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
    const [historyDateFilter, setHistoryDateFilter] = useState('all');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        image: '',
        category: 'ink',
        currentStock: 0,
        unit: 'pcs',
        cost: 0,
        retailPrice: 0,
        minStock: 5,
        maxStock: 100,
        supplier: ''
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
        setter({ mounted: false, visible: false });
        setSelectedItem(null);
    };

    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({
            isOpen: true,
            title,
            message,
            type,
            isAlert: true,
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    // ── Image crop state ──
    const [cropperImage, setCropperImage] = useState(null);

    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            showAlert('Invalid File Type', 'Only JPEG, PNG, and WEBP images are allowed.', 'error');
            e.target.value = '';
            return;
        }

        // Validate file size (3MB)
        if (file.size > MAX_IMAGE_SIZE) {
            showAlert('File Too Large', 'Image must be under 3MB. Please compress or resize the image and try again.', 'error');
            e.target.value = '';
            return;
        }

        // Read file and open cropper
        const reader = new FileReader();
        reader.onloadend = () => {
            setCropperImage(reader.result);
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset so same file can be re-selected
    };

    const handleCropDone = (croppedBase64) => {
        setFormData(prev => ({ ...prev, image: croppedBase64 }));
        setCropperImage(null);
    };

    const handleCropCancel = () => {
        setCropperImage(null);
    };

    const confirmDeleteKit = async (serviceType) => {
        try {
            const res = await Axios.delete(`${API_URL}/api/admin/service-kits/${encodeURIComponent((serviceType || '').trim())}`);
            if (res.data.success) {
                showAlert('Deleted', `Service kit '${serviceType}' has been removed.`, 'success');
                fetchServiceKits();
            } else {
                showAlert('Error', res.data.message || 'Failed to delete service kit.', 'danger');
            }
        } catch (error) {
            console.error('Error deleting service kit', error);
            showAlert('Error', error.response?.data?.message || 'Failed to delete service kit.', 'danger');
        } finally {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
    };

    const handleDeleteKit = (serviceType) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Confirm Delete',
            message: `Delete service kit '${serviceType}'? This cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            type: 'danger',
            isAlert: false,
            onConfirm: () => confirmDeleteKit(serviceType)
        });
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
                    lastRestocked: i.last_restocked,
                    minStock: i.min_stock,
                    maxStock: i.max_stock,
                    retailPrice: i.retail_price
                }));
                setInventory(mapped);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching inventory:", error);
            setLoading(false);
        }
    };

    const fetchServiceKits = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/service-kits`);
            if (res.data.success) {
                setServiceKits(res.data.data);
            }
        } catch (error) {
            console.error("Error fetching service kits:", error);
        }
    };

    const handleManageKits = () => {
        fetchServiceKits();
        openModal(setServiceKitsModal);
    };

    const handleSaveKit = async () => {
        if (!validateKitField(editingKitServiceType)) return;
        setIsSaving(true);
        try {
            await Axios.post(`${API_URL}/api/admin/service-kits`, {
                service_type: editingKitServiceType.trim(),
                old_service_type: (editingKitOriginalType || editingKitServiceType).trim(),
                materials: editingKitMaterials.map(m => ({ inventory_id: m.inventory_id, default_quantity: m.default_quantity }))
            });
            showAlert("Success", "Service Kit saved successfully!", "success");
            fetchServiceKits();
            setEditingKitServiceType('');
            setEditingKitOriginalType('');
            setEditingKitMaterials([]);
        } catch (error) {
            console.error("Error saving service kit", error);
            showAlert("Error", "Error saving service kit", "danger");
        } finally {
            setIsSaving(false);
        }
    };

    const filterAndSortInventory = () => {
        let filtered = inventory.filter(item => {
            const matchesSearch = 
                (item.id || '').toString().includes(searchTerm) || 
                (item.name || '').toLowerCase().includes(searchTerm.toLowerCase());
            
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
        setConfirmDialog({
            isOpen: true,
            title: 'Confirm Print',
            message: 'Are you sure you want to generate a printable report of the current inventory?',
            confirmText: 'Print',
            type: 'info',
            isAlert: false,
            onConfirm: () => {
                const printWindow = window.open('', '_blank');
                const printData = filteredInventory.map(item => 
                    `<tr>
                        <td>${item.name || 'N/A'}</td>
                        <td>${item.category || 'N/A'}</td>
                        <td>${item.currentStock || '0'}</td>
                        <td>${item.unit || 'N/A'}</td>
                        <td>₱${parseFloat(item.cost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>${getStockStatus(item.currentStock, item.minStock, item.maxStock)}</td>
                    </tr>`
                ).join('');

                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Print Inventory Status</title>
                            <style>
                                body { font-family: sans-serif; padding: 20px; color: #333; }
                                h1 { color: #1e293b; text-align: center; }
                                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 14px; }
                                th { background-color: #f1f5f9; color: #475569; }
                            </style>
                        </head>
                        <body>
                            <h1>Inventory Status Report</h1>
                            <p style="text-align:center;">Generated on ${new Date().toLocaleString()}</p>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Item Name</th>
                                        <th>Category</th>
                                        <th>Current Stock</th>
                                        <th>Unit</th>
                                        <th>Cost</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${printData}
                                </tbody>
                            </table>
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                }, 250);
            }
        });
    };

    const handleExportCSV = () => {
        setConfirmDialog({
            isOpen: true,
            title: 'Confirm Export',
            message: 'Are you sure you want to download a CSV export of the current inventory?',
            confirmText: 'Export',
            type: 'info',
            isAlert: false,
            onConfirm: () => {
                const headerRows = generateReportHeader('Inventory Status Report', {
                    'Category': categoryFilter !== 'all' ? categoryFilter : null,
                    'Stock Level': stockStatusFilter !== 'all' ? stockStatusFilter : null,
                    'Item Status': itemStatusFilter,
                    'Search': searchTerm || null,
                    'Sort By': sortBy
                });

                const columnHeaders = ['Item Name', 'Category', 'Current Stock', 'Unit', 'Cost (₱)', 'Status'];
                const dataRows = filteredInventory.map(item => [
                    item.name,
                    item.category,
                    item.currentStock,
                    item.unit,
                    item.cost,
                    getStockStatus(item.currentStock, item.minStock, item.maxStock)
                ]);

                downloadCsv([...headerRows, columnHeaders, ...dataRows], 'inventory_export');
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const getStockStatus = (current, min, max) => {
        if (current === 0) return 'out_of_stock';
        if (min && current <= min) return 'low';
        if (max && current > max) return 'overstock';
        return 'optimal';
    };

    const handleEdit = (item) => {
        setSelectedItem(item);
        setFormData({
            name: item.name,
            image: item.image || '',
            category: item.category,
            currentStock: item.currentStock,
            unit: item.unit,
            cost: item.cost,
            retailPrice: item.retailPrice || 0,
            minStock: item.minStock || 0,
            maxStock: item.maxStock || 0,
            supplier: item.supplier || ''
        });
        openModal(setAddEditModal);
    };

    const handleDelete = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Item',
            message: 'Are you sure you want to delete this item? It will be moved to the deleted items view.',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/inventory/${id}`);
                    fetchInventory();
                } catch (error) {
                    console.error("Error deleting item:", error);
                }
            }
        });
    };

    const handleRestore = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/admin/inventory/${id}/restore`);
            fetchInventory();
        } catch (error) {
            console.error("Error restoring item:", error);
        }
    };

    const handlePermanentDelete = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Permanently',
            message: 'This will PERMANENTLY delete the item. This action cannot be undone. Continue?',
            confirmText: 'Permanently Delete',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/inventory/${id}/permanent`);
                    fetchInventory();
                } catch (error) {
                    console.error("Error deleting item:", error);
                }
            }
        });
    };

    const handleAddNew = () => {
        setSelectedItem(null);
        setFormData({
            name: '',
            image: '',
            category: 'ink',
            currentStock: 0,
            unit: 'pcs',
            cost: 0,
            retailPrice: 0,
            minStock: 5,
            maxStock: 100,
            supplier: ''
        });
        openModal(setAddEditModal);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (isSaving) return;

        let valid = true;
        valid = validateInventoryField('name', formData.name) && valid;
        valid = validateInventoryField('unit', formData.unit) && valid;
        valid = validateInventoryField('cost', formData.cost) && valid;
        valid = validateInventoryField('retailPrice', formData.retailPrice) && valid;
        valid = validateInventoryField('currentStock', formData.currentStock) && valid;
        valid = validateInventoryField('minStock', formData.minStock) && valid;
        valid = validateInventoryField('maxStock', formData.maxStock) && valid;

        if (!valid) {
            showAlert("Invalid Input", "Please correct the errors in the form.", "warning");
            return;
        }

        // Check for duplicate item name
        const isDuplicate = inventory.some(item => 
            item.name.toLowerCase() === formData.name.trim().toLowerCase() && 
            (!selectedItem || item.id !== selectedItem.id)
        );

        if (isDuplicate) {
            showAlert("Duplicate Item", `An item with the name "${formData.name.trim()}" already exists in the inventory.`, "warning");
            setIsSaving(false);
            return;
        }

        setIsSaving(true);
        try {
            // Ensure numbers are valid before sending
            const payload = {
                ...formData,
                image: formData.image || '',
                currentStock: Number(formData.currentStock) || 0,
                cost: Number(formData.cost) || 0,
                retailPrice: Number(formData.retailPrice) || 0,
                minStock: Number(formData.minStock) || 0,
                maxStock: Number(formData.maxStock) || 0,
                supplier: formData.supplier || ''
            };

            if (selectedItem) {
                await Axios.put(`${API_URL}/api/admin/inventory/${selectedItem.id}`, {
                    ...payload,
                    user_id: adminUser?.id || null
                });
                showAlert("Success", "Item updated successfully!", "success");
            } else {
                await Axios.post(`${API_URL}/api/admin/inventory`, payload);
                showAlert("Success", "Item added successfully!", "success");
            }
            closeModal(setAddEditModal);
            fetchInventory();
        } catch (error) {
            console.error("Error saving item:", error);
            showAlert("Error", "Failed to save item: " + (error.response?.data?.message || error.message), "danger");
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

        if (!validateTransactionField('quantity', transactionData.quantity)) {
            setTransactionError("Quantity must be a positive whole number.");
            return;
        }

        try {
            const quantity = Number(transactionData.quantity);

            // Prevent deducting more than available stock
            if (transactionData.type === 'out' && quantity > selectedItem.currentStock) {
                setTransactionError(`Cannot deduct more than the available stock. You have ${selectedItem.currentStock} ${selectedItem.unit} left.`);
                return;
            }

            await Axios.post(`${API_URL}/api/admin/inventory/${selectedItem.id}/transaction`, {
                ...transactionData,
                quantity: quantity,
                user_id: adminUser?.id || null
            });
            closeModal(setTransactionModal);
            fetchInventory();
        } catch (error) {
            console.error("Error processing transaction:", error);
            setTransactionError("Transaction failed. Please try again.");
        }
    };

    const fetchHistory = async (page = 1) => {
        setHistoryLoading(true);
        try {
            const res = await Axios.get(`${API_URL}/api/admin/inventory/transactions?page=${page}&limit=50`);
            if (res.data.success) {
                setTransactions(res.data.data);
                setHistoryPage(res.data.pagination?.page || 1);
                setHistoryTotalPages(res.data.pagination?.totalPages || 1);
                setHistoryTotal(res.data.pagination?.total || res.data.data.length);
                if (!historyModal.mounted) openModal(setHistoryModal);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Filtered transactions for the history modal
    const filteredTransactions = transactions.filter(t => {
        const matchesSearch = historySearch === '' ||
            (t.item_name || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (t.reason || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (t.user_name || '').toLowerCase().includes(historySearch.toLowerCase());
        const matchesType = historyTypeFilter === 'all' || t.type === historyTypeFilter;
        let matchesDate = true;
        if (historyDateFilter !== 'all') {
            const today = new Date();
            const transactionDate = new Date(t.created_at);
            if (historyDateFilter === 'today') {
                matchesDate = transactionDate.toDateString() === today.toDateString();
            } else if (historyDateFilter === 'week') {
                const oneWeekAgo = new Date(today);
                oneWeekAgo.setDate(today.getDate() - 7);
                matchesDate = transactionDate >= oneWeekAgo;
            } else if (historyDateFilter === 'month') {
                const oneMonthAgo = new Date(today);
                oneMonthAgo.setMonth(today.getMonth() - 1);
                matchesDate = transactionDate >= oneMonthAgo;
            } else if (historyDateFilter === 'year') {
                const oneYearAgo = new Date(today);
                oneYearAgo.setFullYear(today.getFullYear() - 1);
                matchesDate = transactionDate >= oneYearAgo;
            }
        }
        return matchesSearch && matchesType && matchesDate;
    });

    const lowStockItems = inventory.filter(i => i.currentStock <= i.minStock).length;
    const totalValue = inventory.reduce((sum, i) => sum + (i.currentStock * i.cost), 0);

    // Compute autocomplete suggestions dynamically from the dataset
    const searchSuggestions = Array.from(new Set([
        ...inventory.map(i => (i.id || '').toString()),
        ...inventory.map(i => (i.name || '').trim()),
        ...inventory.map(i => (i.category || '').trim())
    ])).filter(Boolean);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
            {/* Print Only Header */}
            <div className="print-only-header">
                <div className="admin-st-c6657cae">
                    <div>
                        <h1 className="admin-st-b43c9608">InkVistAR Studio</h1>
                        <p className="admin-st-c4858c02">Inventory & Stock Report</p>
                    </div>
                    <div className="admin-st-7851dbc0">
                        <p className="admin-st-c4858c02">Date: {new Date().toLocaleDateString()}</p>
                        <p className="admin-st-c4858c02">Total Value: ₱{totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                </div>
            </div>
            <header className="portal-header">
                <div className="header-title">
                        <h1>Inventory Management</h1>
                    </div>
                <div className="header-actions">
                    <button className="btn btn-secondary icon-btn" onClick={handlePrint} title="Print Report">
                        <Printer size={18}/>
                    </button>
                    <button className="btn btn-secondary icon-btn" onClick={handleExportCSV} title="Download CSV">
                        <Download size={18}/>
                    </button>
                    
                    <div className="modern-view-toggle" style={{ margin: '0 8px' }}>
                        <button className="toggle-btn active" onClick={fetchHistory} title="View Stock History">
                            <History size={16}/> <span>History</span>
                        </button>
                        <button className="toggle-btn" onClick={handleManageKits} title="Manage Service Kits" style={{ color: '#1e293b' }}>
                            <Package size={16}/> <span>Kits</span>
                        </button>
                    </div>

                    <button className="btn btn-primary" onClick={handleAddNew}>
                        <Plus size={18}/> Add Item
                    </button>
                </div>
            </header>
                <p className="header-subtitle">Track, manage, and audit studio supplies</p>

            <div className="inventory-stats-grid">
                <div className="stat-card-v2 glass-card">
                    <div className="stat-icon-wrapper blue">
                        <Package size={24} />
                    </div>
                    <div className="stat-info-v2">
                        <span className="stat-label-v2">Total Items</span>
                        <h3 className="stat-value-v2">{inventory.length}</h3>
                        <div className="stat-trend-v2">Across all categories</div>
                    </div>
                </div>
                <div className="stat-card-v2 glass-card">
                    <div className="stat-icon-wrapper orange">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="stat-info-v2">
                        <span className="stat-label-v2">Low Stock</span>
                        <h3 className="stat-value-v2 admin-st-b7dbe9cd">{lowStockItems}</h3>
                        <div className="stat-trend-v2 admin-st-b7dbe9cd">Needs attention</div>
                    </div>
                </div>
                <div className="stat-card-v2 glass-card">
                    <div className="stat-icon-wrapper green">
                        <PhilippinePeso size={24} />
                    </div>
                    <div className="stat-info-v2">
                        <span className="stat-label-v2">Inventory Value</span>
                        <h3 className="stat-value-v2">₱{totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                        <div className="stat-trend-v2">Current market cost</div>
                    </div>
                </div>
                <div className="stat-card-v2 glass-card">
                    <div className="stat-icon-wrapper purple">
                        <Layers size={24} />
                    </div>
                    <div className="stat-info-v2">
                        <span className="stat-label-v2">Categories</span>
                        <h3 className="stat-value-v2">{new Set(inventory.map(i => i.category)).size}</h3>
                        <div className="stat-trend-v2">Product groups</div>
                    </div>
                </div>
            </div>

            <div className="premium-filter-bar premium-filter-bar--stacked">
                    <div className="premium-search-box premium-search-box--full" ref={searchRef}>
                        <Search size={16} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search items by name, category, or ID..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            maxLength={100}
                        />
                        {showSuggestions && searchTerm && searchSuggestions.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 && (
                            <div className="autocomplete-dropdown waterfall-dropdown">
                                {searchSuggestions
                                    .filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .slice(0, 8)
                                    .map((suggestion, index) => (
                                        <div 
                                            key={suggestion} 
                                            className="autocomplete-item waterfall-item"
                                            style={{ animationDelay: `${index * 0.05}s` }}
                                            onClick={() => {
                                                setSearchTerm(suggestion);
                                                setShowSuggestions(false);
                                            }}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    <div className="premium-filters-row">
                        <div className="premium-filter-item">
                            <CustomSelect
                                value={itemStatusFilter}
                                onChange={setItemStatusFilter}
                                options={[
                                    { value: 'active', label: 'Active Items' },
                                    { value: 'deleted', label: 'Deleted Items' }
                                ]}
                                icon={Filter}
                                width="160px"
                            />
                        </div>

                        <div className="premium-filter-item">
                            <CustomSelect
                                value={categoryFilter}
                                onChange={setCategoryFilter}
                                options={[
                                    { value: 'all', label: 'All Categories' },
                                    ...INVENTORY_CATEGORIES
                                ]}
                                width="160px"
                            />
                        </div>

                        <div className="premium-filter-item">
                            <CustomSelect
                                value={stockStatusFilter}
                                onChange={setStockStatusFilter}
                                options={[
                                    { value: 'all', label: 'All Stock Levels' },
                                    { value: 'out_of_stock', label: 'Out of Stock' },
                                    { value: 'low', label: 'Low Stock' },
                                    { value: 'optimal', label: 'Optimal' },
                                    { value: 'overstock', label: 'Overstock' }
                                ]}
                                width="160px"
                            />
                        </div>

                        <div className="premium-filter-item">
                            <CustomSelect
                                value={sortBy}
                                onChange={setSortBy}
                                options={[
                                    { value: 'name', label: 'Name' },
                                    { value: 'stock', label: 'Stock Level' },
                                    { value: 'category', label: 'Category' }
                                ]}
                                icon={SlidersHorizontal}
                                width="160px"
                            />
                        </div>
                    </div>
                </div>



            <div className="table-card-container glass-card">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Category</th>
                                <th>Current Stock</th>
                                <th>Min Stock</th>
                                <th>Unit</th>
                                <th>Cost</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" className="no-data admin-st-3927920f">Loading inventory...</td></tr>
                            ) : paginatedInventory.length > 0 ? (
                                paginatedInventory.map((item) => (
                                    <tr key={item.id} className={`status-${getStockStatus(item.currentStock, item.minStock, item.maxStock)}`}>
                                        <td data-label="Item Name"><strong>{item.name}</strong></td>
                                        <td data-label="Category">
                                            <span className={`badge category-${item.category}`}>
                                                {item.category}
                                            </span>
                                        </td>
                                        <td data-label="Current Stock" className="text-center">
                                            <span className="admin-fw-600">{item.currentStock}</span>
                                        </td>
                                        <td data-label="Min Stock" className="text-muted text-center admin-st-e7992da2">{item.minStock}</td>
                                        <td data-label="Unit">{item.unit}</td>
                                <td data-label="Cost">₱{item.retailPrice ? item.retailPrice.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.cost.toLocaleString()}</td>
                                        <td data-label="Status">
                                            <span className={`badge stock-${getStockStatus(item.currentStock, item.minStock, item.maxStock)}`}>
                                                {getStockStatus(item.currentStock, item.minStock, item.maxStock)}
                                            </span>
                                        </td>
                                        <td data-label="Actions" className="actions-cell">
                                            {itemStatusFilter === 'active' ? (
                                                <div className="admin-st-8487929b">
                                                    <button className="action-btn admin-st-b3452762" onClick={() => openTransactionModal(item, 'in')} title="Stock In" style={{ backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}>
                                                        <ArrowUpCircle size={16}/>
                                                    </button>
                                                    <button className="action-btn admin-st-e2101411" onClick={() => openTransactionModal(item, 'out')} title="Stock Out" style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}>
                                                        <ArrowDownCircle size={16}/>
                                                    </button>
                                                    <button className="action-btn edit-btn admin-st-c4858c02" onClick={() => handleEdit(item)} title="Edit" style={{ backgroundColor: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
                                                        <Edit2 size={16}/>
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button className="action-btn view-btn admin-st-f1f5ea52" onClick={() => handleRestore(item.id)} title="Restore"><RotateCcw size={16}/></button>
                                                    <button className="action-btn delete-btn" onClick={() => handlePermanentDelete(item.id)} title="Permanent Delete"><Trash2 size={16}/></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="8" className="no-data">No items found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    onItemsPerPageChange={(newVal) => {
                        setItemsPerPage(newVal);
                        setCurrentPage(1);
                    }}
                    totalItems={filteredInventory.length}
                    unit="items"
                />
            </div>
            </div> {/* Closes .admin-page */}

            {/* Add/Edit Modal */}
            {addEditModal.mounted && (
                <div className={`modal-overlay ${addEditModal.visible ? 'open' : ''}`} onClick={() => closeModal(setAddEditModal)}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedItem ? 'Edit Inventory Item' : 'Register New Item'}</h2>
                            <button className="close-btn" onClick={() => closeModal(setAddEditModal)}><X size={24}/></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="admin-st-6e0f6c6a">
                                    {/* Left Column: Basic Info */}
                                    <div className="admin-st-ff43421e">
                                        <div className="form-group">
                                            <label className="premium-label">Product Image</label>
                                            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="form-input" style={{padding: '8px'}} />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: '4px' }}>Max 3MB · JPEG, PNG, or WEBP · Will be cropped to 1:1</span>
                                            {formData.image && <img src={formData.image} alt="Preview" style={{marginTop: '10px', width: '100px', height: '100px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #e2e8f0'}} />}
                                        </div>
                                        <div className="form-group">
                                            <label className="premium-label">Product Identity</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => handleInventoryInputChange('name', e.target.value.substring(0, 150))}
                                                className={`form-input ${errors.name ? 'error' : ''}`}
                                                placeholder="e.g. Dynamic Black Ink 8oz"
                                                maxLength={150}
                                            />
                                            {errors.name && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.name}</small>}
                                        </div>
                                        <div className="admin-st-c68bdd5b">
                                            <div className="form-group">
                                                <label className="admin-st-af89d6d6">Category *</label>
                                                <select 
                                                    value={formData.category}
                                                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                                                    className="form-input"
                                                >
                                                    {INVENTORY_CATEGORIES.map(cat => (
                                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="admin-st-af89d6d6">Unit *</label>
                                                <input
                                                    type="text"
                                                    value={formData.unit}
                                                    onChange={(e) => handleInventoryInputChange('unit', e.target.value.substring(0, 30))}
                                                    className={`form-input ${errors.unit ? 'error' : ''}`}
                                                    placeholder="pcs, oz, boxes"
                                                    maxLength={30}
                                                />
                                                {errors.unit && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.unit}</small>}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="premium-label">Financials (₱)</label>
                                            <div className="admin-st-c68bdd5b">
                                                <div>
                                                    <label className="admin-st-af89d6d6">Cost Price</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={formData.cost}
                                                        onChange={(e) => handleInventoryInputChange('cost', filterMoney(e.target.value))}
                                                        className={`form-input ${errors.cost ? 'error' : ''}`}
                                                    />
                                                    {errors.cost && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.cost}</small>}
                                                </div>
                                                <div>
                                                    <label className="admin-st-af89d6d6">Retail Price</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={formData.retailPrice}
                                                        onChange={(e) => handleInventoryInputChange('retailPrice', filterMoney(e.target.value))}
                                                        className={`form-input admin-st-45e16daa ${errors.retailPrice ? 'error' : ''}`}
                                                    />
                                                    {errors.retailPrice && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.retailPrice}</small>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Stock Levels */}
                                    <div className="admin-st-ff43421e">
                                        <div className="form-group">
                                            <label className="premium-label">Stock Status</label>
                                            <div className="glass-panel">
                                                <label className="admin-st-4d4ffce1">Initial / Current Quantity</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={formData.currentStock}
                                                    onChange={(e) => handleInventoryInputChange('currentStock', clampNumber(e.target.value, 0, 999999))}
                                                    className={`form-input admin-st-7047dd0b ${errors.currentStock ? 'error' : ''}`}
                                                />
                                                {errors.currentStock && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.currentStock}</small>}
                                            </div>
                                        </div>

                                        <div className="glass-panel danger">
                                            <span className="panel-title">Stock Limits</span>
                                            <div className="admin-st-ece89b73">
                                                <div>
                                                    <label className="admin-st-496ebd9a">Min (Alert)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={formData.minStock}
                                                        onChange={(e) => handleInventoryInputChange('minStock', clampNumber(e.target.value, 0, 999999))}
                                                        className={`form-input ${errors.minStock ? 'error' : ''}`}
                                                    />
                                                    {errors.minStock && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.minStock}</small>}
                                                </div>
                                                <div>
                                                    <label className="admin-st-496ebd9a">Max (Goal)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={formData.maxStock}
                                                        onChange={(e) => handleInventoryInputChange('maxStock', clampNumber(e.target.value, 0, 999999))}
                                                        className={`form-input ${errors.maxStock ? 'error' : ''}`}
                                                    />
                                                    {errors.maxStock && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.maxStock}</small>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                {selectedItem && (
                                    <button type="button" className="action-btn delete-btn admin-st-47451e19" onClick={() => { closeModal(setAddEditModal); handleDelete(selectedItem.id); }} disabled={isSaving}>
                                        <Trash2 size={16} /> Delete Item
                                    </button>
                                )}
                                <button type="button" className="btn btn-secondary" onClick={() => closeModal(setAddEditModal)} disabled={isSaving}>Cancel</button>
                                <button type="submit" className="btn btn-primary admin-st-ccf37d25" disabled={isSaving}>
                                    {selectedItem ? 'Update Stock Item' : 'Register Item'}
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
                            <h2>{transactionData.type === 'in' ? 'Restock Item' : 'Deduct Stock'}</h2>
                            <button className="close-btn" onClick={() => closeModal(setTransactionModal)}><X size={24}/></button>
                        </div>
                        <form onSubmit={handleTransaction}>
                            <div className="modal-body">
                                <div className="admin-st-7f97b32e">
                                    <div className="admin-st-14f13811">
                                        <Package size={24} className="text-bronze" />
                                    </div>
                                    <div>
                                        <h3 className="admin-st-f7749303">{selectedItem?.name}</h3>
                                        <p className="admin-st-0a7b94ac">Current: {selectedItem?.currentStock} {selectedItem?.unit}</p>
                                    </div>
                                </div>

                                <div className="form-group admin-mb-20">
                                    <label className="admin-st-80a8a11c">Quantity to {transactionData.type === 'in' ? 'Add' : 'Remove'} ({selectedItem?.unit}) *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={transactionData.quantity}
                                        onChange={(e) => handleTransactionInputChange('quantity', clampNumber(e.target.value, 1, 999999))}
                                        className={`form-input admin-st-934f10ff ${errors.tx_quantity ? 'error' : ''}`}
                                    />
                                    {errors.tx_quantity && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.tx_quantity}</small>}
                                </div>

                                <div className="form-group">
                                    <label className="admin-st-80a8a11c">Reason / Note</label>
                                    <select
                                        value={transactionData.reason}
                                        onChange={(e) => setTransactionData({...transactionData, reason: e.target.value})}
                                        className="form-input"
                                    >
                                        {transactionData.type === 'in' ? (
                                            <>
                                                <option value="Restock">Bulk Restock</option>
                                                <option value="Return">Return from Session</option>
                                                <option value="Adjustment">Manual Correction</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Session Usage">Artist Session Usage</option>
                                                <option value="Expired">Damaged / Expired</option>
                                                <option value="Missing">Lost / Missing</option>
                                                <option value="Adjustment">Manual Correction</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                                {transactionError && <p className="admin-st-5c0c21da">{transactionError}</p>}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => closeModal(setTransactionModal)}>Cancel</button>
                                <button type="submit" className={`btn ${transactionData.type === 'in' ? 'btn-primary' : ''}`} style={{ background: transactionData.type === 'out' ? '#ef4444' : undefined, color: 'white', padding: '10px 24px' }}>
                                    Confirm {transactionData.type === 'in' ? 'Addition' : 'Deduction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {historyModal.mounted && (
                <div className={`modal-overlay ${historyModal.visible ? 'open' : ''}`} onClick={() => { closeModal(setHistoryModal); setHistorySearch(''); setHistoryTypeFilter('all'); setHistoryDateFilter('all'); }}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()} style={{ height: '85vh', maxHeight: '800px', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <History size={20} color="white" />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0 }}>Transaction History</h2>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>{historyTotal} total transaction{historyTotal !== 1 ? 's' : ''} recorded</p>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => { closeModal(setHistoryModal); setHistorySearch(''); setHistoryTypeFilter('all'); setHistoryDateFilter('all'); }}><X size={24}/></button>
                        </div>

                        {/* Filter Bar */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc' }}>
                            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    placeholder="Search by item, reason, or user..."
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    className="form-input"
                                    style={{ paddingLeft: '32px', fontSize: '0.95rem', height: '46px', borderRadius: '8px' }}
                                    maxLength={100}
                                />
                            </div>
                            <select
                                value={historyDateFilter}
                                onChange={(e) => setHistoryDateFilter(e.target.value)}
                                className="form-input"
                                style={{ width: 'auto', height: '46px', fontSize: '0.95rem', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                <option value="all">All Time</option>
                                <option value="today">Today</option>
                                <option value="week">Past Week</option>
                                <option value="month">Past Month</option>
                                <option value="year">Past Year</option>
                            </select>
                            <select
                                value={historyTypeFilter}
                                onChange={(e) => setHistoryTypeFilter(e.target.value)}
                                className="form-input"
                                style={{ width: 'auto', height: '46px', fontSize: '0.95rem', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                <option value="all">All Types</option>
                                <option value="in">Stock In</option>
                                <option value="out">Stock Out</option>
                                <option value="price_change">Price Change</option>
                            </select>
                        </div>

                        {/* Body */}
                        <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                            {historyLoading ? (
                                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                                    <Clock size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading transaction history...</p>
                                </div>
                            ) : filteredTransactions.length === 0 ? (
                                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                                    <Inbox size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#64748b' }}>
                                        {historySearch || historyTypeFilter !== 'all' ? 'No matching transactions' : 'No transactions yet'}
                                    </p>
                                    <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                                        {historySearch || historyTypeFilter !== 'all'
                                            ? 'Try adjusting your search or filter criteria.'
                                            : 'Transactions will appear here when stock is added or deducted.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="data-table" style={{ fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '160px' }}>Date & Time</th>
                                                <th>Item</th>
                                                <th style={{ width: '80px', textAlign: 'center' }}>Type</th>
                                                <th style={{ width: '80px', textAlign: 'center' }}>Qty</th>
                                                <th style={{ width: '100px', textAlign: 'right' }}>Price</th>
                                                <th>Action By</th>
                                                <th>Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTransactions.map(t => (
                                                <tr key={t.id}>
                                                    <td style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Clock size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                                                            {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', paddingLeft: '19px' }}>
                                                            {new Date(t.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{t.item_name}</div>
                                                        <span className={`badge category-${t.category}`} style={{ fontSize: '0.7rem', marginTop: '2px' }}>{t.category}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                                            background: t.type === 'price_change' ? '#fffbeb' : (t.type === 'in' ? '#10b981' : '#ef4444'),
                                                            color: t.type === 'price_change' ? '#b45309' : '#ffffff',
                                                            border: t.type === 'price_change' ? '1px solid #fde68a' : 'none'
                                                        }}>
                                                            {t.type === 'price_change' ? <PhilippinePeso size={13} /> : (t.type === 'in' ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />)}
                                                            {t.type === 'price_change' ? 'PRICE' : (t.type === 'in' ? 'IN' : 'OUT')}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.9rem', color: t.type === 'price_change' ? '#b45309' : (t.type === 'in' ? '#10b981' : '#ef4444') }}>
                                                        {t.type === 'price_change' ? '—' : `${t.type === 'in' ? '+' : '-'}${t.quantity} ${t.unit || ''}`}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>
                                                        {t.item_price != null ? `₱${Number(t.item_price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <div style={{
                                                                width: '26px', height: '26px', borderRadius: '6px',
                                                                background: t.user_name === 'System' ? '#f1f5f9' : 'linear-gradient(135deg, #be9055, #d4af37)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                            }}>
                                                                <User size={13} color={t.user_name === 'System' ? '#94a3b8' : 'white'} />
                                                            </div>
                                                            <span style={{ fontSize: '0.85rem', color: t.user_name === 'System' ? '#94a3b8' : '#1e293b', fontWeight: 500, fontStyle: t.user_name === 'System' ? 'italic' : 'normal' }}>
                                                                {t.user_name || 'System'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: '200px' }}>
                                                        {t.reason || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No reason</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer with pagination */}
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                Showing {filteredTransactions.length} of {historyTotal} transactions
                                {historyTotalPages > 1 && ` (page ${historyPage} of ${historyTotalPages})`}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {historyPage > 1 && (
                                    <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => fetchHistory(historyPage - 1)}>Previous</button>
                                )}
                                {historyPage < historyTotalPages && (
                                    <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => fetchHistory(historyPage + 1)}>Next</button>
                                )}
                                <button className="btn btn-secondary" onClick={() => { closeModal(setHistoryModal); setHistorySearch(''); setHistoryTypeFilter('all'); setHistoryDateFilter('all'); }}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Service Kits Modal */}
            {serviceKitsModal.mounted && (
                <div className={`modal-overlay ${serviceKitsModal.visible ? 'open' : ''}`} onClick={() => closeModal(setServiceKitsModal)}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="admin-flex-center admin-gap-15">
                                <div className="admin-st-007284eb">
                                    <Package size={20} className="text-orange" />
                                </div>
                                <div>
                                    <h2 className="admin-m-0">Service Kit Protocols</h2>
                                    <p className="admin-st-925e4e02">Configure mandatory supply lists for specific services</p>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => closeModal(setServiceKitsModal)}><X size={24}/></button>
                        </div>
                        <div className="modal-body admin-st-7215da49">
                            <div className="glass-card admin-st-654f1b6d">
                                <h3 className="admin-st-299edae5">
                                    <Plus size={18} /> {editingKitOriginalType ? 'Modify System Kit' : 'Register New Protocol'}
                                </h3>
                                <div className="form-group">
                                    <label className="admin-st-d050454a">Service Designation</label>
                                    <input 
                                        type="text" 
                                        className={`form-input ${errors.kit_name ? 'error' : ''}`} 
                                        placeholder="e.g. Minimalist Tattoo, Piercing"
                                        value={editingKitServiceType}
                                        onChange={e => {
                                            setEditingKitServiceType(e.target.value.substring(0, 50));
                                            validateKitField(e.target.value);
                                        }}
                                        maxLength={50}
                                    />
                                    {errors.kit_name && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.kit_name}</small>}
                                </div>
                                <div className="form-group admin-st-185d793c">
                                    <label>Add Item to Kit</label>
                                    <CustomSelect
                                        value=""
                                        onChange={(val) => {
                                            const itemId = Number(val);
                                            if (!itemId) return;
                                            const item = inventory.find(i => i.id === itemId);
                                            if (item && !editingKitMaterials.find(m => m.inventory_id === itemId)) {
                                                setEditingKitMaterials([...editingKitMaterials, { inventory_id: item.id, item_name: item.name, default_quantity: 1, unit: item.unit }]);
                                            }
                                        }}
                                        options={[
                                            { value: '', label: '-- Select Inventory Item --' },
                                            ...inventory.map(item => ({ value: item.id, label: `${item.name} (${item.unit})` }))
                                        ]}
                                    />
                                </div>
                                
                                {editingKitMaterials.length > 0 && (
                                    <div className="admin-st-988c5fa7">
                                        <label>Kit Items:</label>
                                        {editingKitMaterials.map((mat, idx) => (
                                            <div key={idx} className="admin-st-57608dc7 waterfall-item" style={{ animationDelay: `${idx * 0.05}s` }}>
                                                <input 
                                                    type="number" 
                                                    min="1"
                                                    value={mat.default_quantity}
                                                    onChange={e => {
                                                        const newVal = [...editingKitMaterials];
                                                        newVal[idx].default_quantity = clampNumber(e.target.value, 1, 999999);
                                                        setEditingKitMaterials(newVal);
                                                    }}
                                                    className="admin-st-8381b655"
                                                />
                                                <span className="admin-st-49cdf874">{mat.item_name} ({mat.unit})</span>
                                                <button 
                                                    className="action-btn delete-btn" 
                                                    onClick={() => setEditingKitMaterials(editingKitMaterials.filter((_, i) => i !== idx))}
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="admin-st-bce72c81">
                                     <button className="btn btn-primary" onClick={handleSaveKit} disabled={isSaving || editingKitMaterials.length === 0}>
                                        {isSaving ? 'Saving...' : 'Save Kit'}
                                     </button>
                                </div>
                            </div>

                            {/* Existing Kits */}
                            <h3>Existing Service Kits</h3>
                            {Object.keys(serviceKits).length === 0 ? (
                                <p className="text-muted">No service kits configured yet.</p>
                            ) : (
                                Object.entries(serviceKits).map(([type, materials]) => (
                                    <div key={type} style={{ 
                                        border: '1px solid #e5e7eb', 
                                        borderRadius: '8px', 
                                        padding: '1rem', 
                                        marginBottom: '1rem',
                                        backgroundColor: editingKitOriginalType === type ? '#f0f9ff' : 'white',
                                        borderColor: editingKitOriginalType === type ? '#7dd3fc' : '#e5e7eb'
                                    }}>
                                        {editingKitOriginalType === type ? (
                                            <div className="inline-edit-form fade-in">
                                                <div className="form-group">
                                                    <label className="admin-st-a2d5e684">Update Service Type Name</label>
                                                    <input 
                                                        type="text" 
                                                        className={`form-input ${errors.kit_name ? 'error' : ''}`} 
                                                        value={editingKitServiceType}
                                                        onChange={e => {
                                                            setEditingKitServiceType(e.target.value.substring(0, 50));
                                                            validateKitField(e.target.value);
                                                        }}
                                                        maxLength={50}
                                                    />
                                                    {errors.kit_name && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.kit_name}</small>}
                                                </div>
                                                <div className="form-group admin-st-988c5fa7">
                                                    <label className="admin-st-a2d5e684">Add Supplies to Kit</label>
                                                    <CustomSelect
                                                        value=""
                                                        onChange={(val) => {
                                                            const itemId = Number(val);
                                                            if (!itemId) return;
                                                            const item = inventory.find(i => i.id === itemId);
                                                            if (item && !editingKitMaterials.find(m => m.inventory_id === itemId)) {
                                                                setEditingKitMaterials([...editingKitMaterials, { inventory_id: item.id, item_name: item.name, default_quantity: 1, unit: item.unit }]);
                                                            }
                                                        }}
                                                        options={[
                                                            { value: '', label: '-- Select Inventory Item --' },
                                                            ...inventory.map(item => ({ value: item.id, label: `${item.name} (${item.unit})` }))
                                                        ]}
                                                    />
                                                </div>
                                                <div className="admin-st-f3877976">
                                                    {editingKitMaterials.map((mat, idx) => (
                                                        <div key={idx} className="waterfall-item" style={{ animationDelay: `${idx * 0.05}s`, display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', borderBottom: idx === editingKitMaterials.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                            <input 
                                                                type="number" 
                                                                min="1"
                                                                value={mat.default_quantity}
                                                                onChange={e => {
                                                                    const newVal = [...editingKitMaterials];
                                                                    newVal[idx].default_quantity = clampNumber(e.target.value, 1, 999999);
                                                                    setEditingKitMaterials(newVal);
                                                                }}
                                                                className="admin-st-b9da71e3"
                                                            />
                                                            <span className="admin-st-25d395ac">{mat.item_name}</span>
                                                            <button 
                                                                className="action-btn delete-btn admin-st-67e81612"
                                                                onClick={() => setEditingKitMaterials(editingKitMaterials.filter((_, i) => i !== idx))}
                                                            >
                                                                <X size={14}/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="admin-st-6a3a6aa8">
                                                    <button type="button" className="btn btn-secondary admin-st-2029b6f9" onClick={() => { setEditingKitServiceType(''); setEditingKitOriginalType(''); setEditingKitMaterials([]); }}>Cancel</button>
                                                    <button type="button" className="btn btn-secondary admin-st-7b8c305f" onClick={() => handleDeleteKit(type)}><Trash2 size={16}/></button>
                                                    <button className="btn btn-primary admin-st-2029b6f9" onClick={handleSaveKit} disabled={isSaving || editingKitMaterials.length === 0} >{isSaving ? '...' : 'Save Changes'}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <React.Fragment>
                                                <div className="admin-st-db565939">
                                                    <h4 className="admin-st-323ff927">{type}</h4>
                                                    <div className="admin-st-c3b81489">
                                                        <button
                                                            className="action-btn edit-btn service-kit-action-btn admin-st-7f4c9b70" 
                                                            onClick={() => {
                                                                setEditingKitServiceType(type);
                                                                setEditingKitOriginalType(type);
                                                                setEditingKitMaterials(materials.map(m => ({ 
                                                                    inventory_id: m.inventory_id, 
                                                                    item_name: m.item_name, 
                                                                    default_quantity: m.default_quantity,
                                                                    unit: m.unit
                                                                }))); 
                                                            }} 
                                                            style={{ backgroundColor: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
                                                        >
                                                            <Edit2 size={16}/>
                                                        </button>
                                                        <button 
                                                            className="action-btn delete-btn service-kit-action-btn" 
                                                            onClick={() => handleDeleteKit(type)}
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </div>
                                                </div>
                                                <ul className="admin-st-ce1e7d49">
                                                    {materials.map((mat, i) => (
                                                      <li key={i}>{mat.default_quantity}x {mat.item_name}</li>
                                                    ))}
                                                </ul>
                                            </React.Fragment>
                                        )}
                                    </div>
                                ))
                            )}

                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal 
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                confirmText={confirmDialog.confirmText}
                onConfirm={confirmDialog.onConfirm}
                onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                type={confirmDialog.type}
                isAlert={confirmDialog.isAlert}
            />

            {/* 1:1 Image Cropper Modal */}
            {cropperImage && (
                <ImageCropper
                    imageSrc={cropperImage}
                    aspect={1}
                    onCropDone={handleCropDone}
                    onCancel={handleCropCancel}
                />
            )}
        </div>
    );
}

export default AdminInventory;
