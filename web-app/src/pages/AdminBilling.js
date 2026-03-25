import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Plus, Download, FileText, Settings, CreditCard, DollarSign, CheckCircle, Printer, X, Trash2, Edit, Search, Filter, SlidersHorizontal } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import './AdminUsers.css';
import './AdminSettings.css'; // Reusing form styles
import './AdminBilling.css';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import { API_URL } from '../config';

function AdminBilling() {
    const [activeTab, setActiveTab] = useState('invoices');
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const [config, setConfig] = useState({
        baseRate: 150,
        taxRate: 8,
        depositRate: 20,
        size: { small: 100, medium: 250, large: 500 },
        complexity: { simple: 1.0, detailed: 1.5, complex: 2.0 },
        styles: { realism: 1.2, traditional: 1.0, japanese: 1.3, tribal: 1.0 }
    });

    const [invoiceModal, setInvoiceModal] = useState({ mounted: false, visible: false, mode: 'create', id: null });
    const [newInvoice, setNewInvoice] = useState({ client: '', amount: '', type: 'Tattoo Session', status: 'Pending' });
    const [previewModal, setPreviewModal] = useState({ mounted: false, visible: false, invoice: null });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [confirmDialog, setConfirmDialog] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        onConfirm: null,
        type: 'danger',
        isAlert: false
    });

    // Modal animation handlers
    const openModal = (mode = 'create', invoice = null) => {
        if (mode === 'edit' && invoice) {
            setNewInvoice({
                client: invoice.client_name,
                amount: invoice.amount,
                type: invoice.service_type,
                status: invoice.status
            });
            setInvoiceModal({ mounted: true, visible: false, mode: 'edit', id: invoice.id });
        } else {
            setNewInvoice({ client: '', amount: '', type: 'Tattoo Session', status: 'Pending' });
            setInvoiceModal({ mounted: true, visible: false, mode: 'create', id: null });
        }
        setTimeout(() => setInvoiceModal(prev => ({ ...prev, visible: true })), 10);
    };

    const closeModal = () => {
        setInvoiceModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setInvoiceModal({ mounted: false, visible: false, mode: 'create', id: null });
        }, 400);
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

    const openPreview = (invoice) => {
        setPreviewModal({ mounted: true, visible: false, invoice });
        setTimeout(() => setPreviewModal({ mounted: true, visible: true, invoice }), 10);
    };

    const closePreview = () => {
        setPreviewModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setPreviewModal({ mounted: false, visible: false, invoice: null });
        }, 400);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [invRes, settingsRes] = await Promise.all([
                Axios.get(`${API_URL}/api/admin/invoices`),
                Axios.get(`${API_URL}/api/admin/settings`)
            ]);

            if (invRes.data.success) {
                setInvoices(invRes.data.data);
            }
            if (settingsRes.data.success && settingsRes.data.data.billing) {
                setConfig(prev => ({ ...prev, ...settingsRes.data.data.billing }));
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching billing data:", error);
            setLoading(false);
        }
    };

    const handleInvoiceSubmit = async (e) => {
        e.preventDefault();
        try {
            if (invoiceModal.mode === 'edit') {
                await Axios.put(`${API_URL}/api/admin/invoices/${invoiceModal.id}`, newInvoice);
            } else {
                await Axios.post(`${API_URL}/api/admin/invoices`, newInvoice);
            }
            closeModal();
            fetchData(); // Refresh list
        } catch (error) {
            console.error("Error saving invoice:", error);
            showAlert("Error", "Failed to save invoice: " + (error.response?.data?.message || error.message), "danger");
        }
    };

    const handleDeleteInvoice = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Invoice',
            message: 'Are you sure you want to delete this invoice?',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/invoices/${id}`);
                    fetchData();
                } catch (error) {
                    console.error("Error deleting invoice:", error);
                }
            }
        });
    };

    const saveConfig = async () => {
        try {
            await Axios.post(`${API_URL}/api/admin/settings`, {
                section: 'billing',
                data: config
            });
            showAlert("Success", "Configuration saved successfully", "success");
        } catch (error) {
            console.error("Error saving config:", error);
            showAlert("Error", "Failed to save configuration", "danger");
        }
    };

    const handlePrintAction = () => {
        window.print();
    };

    const handleConfigChange = (section, key, value) => {
        if (section) {
            setConfig({ ...config, [section]: { ...config[section], [key]: parseFloat(value) } });
        } else {
            setConfig({ ...config, [key]: parseFloat(value) });
        }
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = inv.client_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              inv.id.toString().includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || inv.status.toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    // Pagination logic
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                    <h1>Billing & Payments</h1>
                    <div style={{display: 'flex', gap: '10px'}}>
                         <button className={`btn ${activeTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('invoices')}>
                            <FileText size={18} style={{marginRight: '5px'}}/> Invoices
                        </button>
                        <button className={`btn ${activeTab === 'config' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('config')}>
                            <Settings size={18} style={{marginRight: '5px'}}/> Configuration
                        </button>
                    </div>
                </header>

                {activeTab === 'invoices' ? (
                        <>
                        <div className="stats-row">
                            <div className="stat-item">
                                <span className="stat-label">Total Revenue (Feb)</span>
                                <span className="stat-count">₱12,450</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Pending Payments</span>
                                <span className="stat-count">₱1,200</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Invoices Issued</span>
                                <span className="stat-count">{invoices.length}</span>
                            </div>
                        </div>

                        <div className="premium-filter-bar">
                            <div className="premium-search-box">
                                <Search size={18} className="text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search invoices by client or ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="premium-filters-group">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
                                    <Filter size={16} />
                                    <span>Status:</span>
                                </div>
                                <select 
                                    value={statusFilter} 
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="premium-select-v2"
                                >
                                    <option value="all">All Status</option>
                                    <option value="pending">Pending</option>
                                    <option value="paid">Paid</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginLeft: '0.5rem' }}>
                                    <SlidersHorizontal size={16} />
                                    <span>Sort:</span>
                                </div>
                                <select className="premium-select-v2">
                                    <option value="date">Date</option>
                                    <option value="amount">Amount</option>
                                </select>

                                <button className="btn btn-primary" onClick={openModal} style={{ marginLeft: '1rem' }}>
                                    <Plus size={18} style={{ marginRight: '5px' }} /> Create Invoice
                                </button>
                            </div>
                        </div>

                        <div className="table-card-container">
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice ID</th>
                                            <th>Client</th>
                                            <th>Service Type</th>
                                            <th>Date</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="7" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading invoices...</td></tr>
                                        ) : paginatedInvoices.map(inv => (
                                            <tr key={inv.id}>
                                                <td>INV-{inv.id}</td>
                                                <td>{inv.client_name}</td>
                                                <td>{inv.service_type}</td>
                                                <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                                                <td>₱{inv.amount}</td>
                                                <td>
                                                    <span className={`badge status-${inv.status.toLowerCase() === 'paid' ? 'active' : 'pending'}`}>
                                                        {inv.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{display: 'flex', gap: '5px'}}>
                                                        <button className="action-btn" title="View / Print Invoice" onClick={() => openPreview(inv)}>
                                                            <FileText size={16}/>
                                                        </button>
                                                        <button className="action-btn" title="Edit" onClick={() => openModal('edit', inv)}>
                                                            <Edit size={16}/>
                                                        </button>
                                                        <button className="action-btn delete-btn" title="Delete" onClick={() => handleDeleteInvoice(inv.id)}>
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
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
                                totalItems={filteredInvoices.length}
                                unit="invoices"
                            />
                        </div>
                    </>
                ) : !loading && (
                    <div className="settings-container" style={{display: 'block', margin: '2rem'}}>
                        <div className="settings-panel">
                            <h2>General Pricing Rules</h2>
                            <div className="settings-section">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Base Hourly Rate (₱)</label>
                                        <input type="number" className="form-input" value={config.baseRate} onChange={(e) => handleConfigChange(null, 'baseRate', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Minimum Deposit (%)</label>
                                        <input type="number" className="form-input" value={config.depositRate} onChange={(e) => handleConfigChange(null, 'depositRate', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tax Rate (%)</label>
                                        <input type="number" className="form-input" value={config.taxRate} onChange={(e) => handleConfigChange(null, 'taxRate', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="settings-panel" style={{marginTop: '2rem'}}>
                            <h2>Complexity Multipliers</h2>
                            <div className="settings-section">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Simple (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.complexity.simple} onChange={(e) => handleConfigChange('complexity', 'simple', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Detailed (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.complexity.detailed} onChange={(e) => handleConfigChange('complexity', 'detailed', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Complex (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.complexity.complex} onChange={(e) => handleConfigChange('complexity', 'complex', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="settings-panel" style={{marginTop: '2rem'}}>
                            <h2>Style Multipliers</h2>
                            <div className="settings-section">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Realism (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.styles.realism} onChange={(e) => handleConfigChange('styles', 'realism', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Traditional (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.styles.traditional} onChange={(e) => handleConfigChange('styles', 'traditional', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Japanese (x)</label>
                                        <input type="number" step="0.1" className="form-input" value={config.styles.japanese} onChange={(e) => handleConfigChange('styles', 'japanese', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <button className="btn btn-primary" style={{marginTop: '2rem'}} onClick={saveConfig}>Save Configuration</button>
                    </div>
                )}

                {/* Create Invoice Modal */}
                {invoiceModal.mounted && (
                    <div className={`modal-overlay ${invoiceModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{invoiceModal.mode === 'edit' ? 'Edit Invoice' : 'Generate Invoice'}</h2>
                                <button className="close-btn" onClick={closeModal}><X size={20}/></button>
                            </div>
                            <form onSubmit={handleInvoiceSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>Client Name</label>
                                        <input type="text" className="form-input" required value={newInvoice.client} onChange={e => setNewInvoice({...newInvoice, client: e.target.value})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Service Type</label>
                                        <select className="form-input" required value={newInvoice.type} onChange={e => setNewInvoice({...newInvoice, type: e.target.value})}>
                                            <option value="Tattoo Session">Tattoo Session</option>
                                            <option value="Consultation">Consultation</option>
                                            <option value="Piercing">Piercing</option>
                                            <option value="Touch-up">Touch-up</option>
                                            <option value="Aftercare Check">Aftercare Check</option>
                                            <option value="Jewelry Purchase">Jewelry Purchase</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Amount (₱)</label>
                                        <input type="number" className="form-input" required value={newInvoice.amount} onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Generate</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* Invoice Preview Modal */}
            {previewModal.mounted && (
                <div className={`modal-overlay preview-modal-overlay ${previewModal.visible ? 'open' : ''}`} onClick={closePreview}>
                    <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header no-print">
                            <h2>Invoice Preview</h2>
                            <div style={{display: 'flex', gap: '10px'}}>
                                <button className="btn btn-primary" onClick={handlePrintAction}>
                                    <Printer size={18} style={{marginRight: '5px'}}/> Print / PDF
                                </button>
                                <button className="close-btn" onClick={closePreview}><X size={24}/></button>
                            </div>
                        </div>
                        
                        <div id="printable-invoice" className="invoice-paper">
                            <div className="invoice-header">
                                <div className="invoice-biz-info">
                                    <h1 style={{color: '#667eea', margin: 0}}>InkVistAR Studio</h1>
                                    <p>123 Tattoo Street, Art District</p>
                                    <p>Metropolis, NY 10001</p>
                                    <p>Phone: (555) 001-2024</p>
                                </div>
                                <div className="invoice-meta">
                                    <h2 style={{margin: 0}}>INVOICE</h2>
                                    <p>ID: INV-{previewModal.invoice.id}</p>
                                    <p>Date: {new Date(previewModal.invoice.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="invoice-divider"></div>

                            <div className="invoice-bill-to">
                                <h3>BILL TO:</h3>
                                <p><strong>{previewModal.invoice.client_name}</strong></p>
                                <p>Client ID: CU-{previewModal.invoice.client_id || 'N/A'}</p>
                            </div>

                            <table className="invoice-table">
                                <thead>
                                    <tr>
                                        <th>Description</th>
                                        <th style={{textAlign: 'right'}}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>{previewModal.invoice.service_type}</td>
                                        <td style={{textAlign: 'right'}}>₱{Number(previewModal.invoice.amount).toLocaleString()}</td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td><strong>Total</strong></td>
                                        <td style={{textAlign: 'right'}}><strong>₱{Number(previewModal.invoice.amount).toLocaleString()}</strong></td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div className="invoice-footer">
                                <p>Thank you for choosing InkVistAR Studio!</p>
                                <p>Status: {previewModal.invoice.status.toUpperCase()}</p>
                                <div className="signature-line">
                                    <p>Authorized Signature</p>
                                    <div style={{borderBottom: '1px solid #000', width: '200px', height: '40px'}}></div>
                                </div>
                            </div>
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
        </div>
    );
}

export default AdminBilling;