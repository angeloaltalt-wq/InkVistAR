import React from 'react';
import { TriangleAlert, Trash2, CheckCircle2, Info } from 'lucide-react';
import '../pages/PortalStyles.css'; // Leverage existing glassmorphism classes

const ConfirmModal = ({ 
    isOpen, 
    title, 
    message, 
    confirmText, 
    cancelText, 
    onConfirm, 
    onClose, 
    type = "danger",
    isAlert = false 
}) => {
    if (!isOpen) return null;

    const isDanger = type === "danger";
    const isSuccess = type === "success";
    const isInfo = type === "info";

    const getIcon = () => {
        if (isDanger) return <Trash2 size={32} />;
        if (isSuccess) return <CheckCircle2 size={32} />;
        if (isInfo) return <Info size={32} />;
        return <TriangleAlert size={32} />;
    };

    const getIconBg = () => {
        if (isDanger) return '#fee2e2';
        if (isSuccess) return '#dcfce7';
        if (isInfo) return '#eff6ff';
        return '#fef3c7';
    };

    const getIconColor = () => {
        if (isDanger) return '#dc2626';
        if (isSuccess) return '#16a34a';
        if (isInfo) return '#3b82f6';
        return '#d97706';
    };

    return (
        <div className="modal-overlay open" onClick={onClose}>
            <div className="modal-content" style={{ maxWidth: '450px', padding: '0', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                    <div style={{ 
                        width: '64px', height: '64px', borderRadius: '50%', 
                        background: getIconBg(), 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        margin: '0 auto 16px', color: getIconColor()
                    }}>
                        {getIcon()}
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 12px', color: '#1e293b' }}>{title || "Confirm Action"}</h2>
                    <p style={{ fontSize: '0.95rem', color: '#64748b', margin: '0', lineHeight: '1.5' }}>{message}</p>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    {!isAlert && (
                        <button 
                            onClick={onClose} 
                            style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', borderRight: '1px solid #f1f5f9', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseOver={e => e.target.style.background = '#f1f5f9'}
                            onMouseOut={e => e.target.style.background = 'transparent'}
                        >
                            {cancelText || "Cancel"}
                        </button>
                    )}
                    <button 
                        onClick={onConfirm} 
                        style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', fontWeight: 700, color: getIconColor(), cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseOver={e => e.target.style.background = '#f1f5f9'}
                        onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        {confirmText || (isAlert ? "Dismiss" : "Confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
