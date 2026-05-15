import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Axios from 'axios';
import { Printer, ArrowLeft } from 'lucide-react';
import { API_URL } from '../config';
import { getDisplayCode } from '../utils/formatters';

/**
 * WaiverPrintView — Shared print/view page for signed Service Waivers.
 * Works for both admin (/admin/appointments/:id/waiver) and customer (/customer/waiver/:id) routes.
 */

const WAIVER_SECTIONS = [
    { title: 'Voluntary Consent', text: 'I voluntarily consent to the tattoo and/or piercing procedure(s) discussed during my consultation. I understand that these procedures involve permanent or semi-permanent modification to my body and that I am proceeding of my own free will.' },
    { title: 'Assumption of Risk', text: 'I acknowledge that tattoo and piercing procedures carry inherent risks including but not limited to: infection, scarring, keloid formation, allergic reactions to ink or metals, nerve damage, prolonged healing, and unsatisfactory aesthetic results. I assume full responsibility for these risks.' },
    { title: 'Release of Liability', text: 'I hereby release, waive, and discharge Inkvictus Tattoo & Piercing Studio, its owners, artists, employees, and agents from any and all liability, claims, demands, or causes of action that may arise from or relate to any complications, adverse reactions, or issues occurring during or after the procedure.', highlight: 'The studio shall not be held liable for any issues, complications, or adverse outcomes arising during or as a result of the procedure.' },
    { title: 'Age Verification', text: 'I confirm that I am at least 18 years of age, or I have obtained the written consent of my parent or legal guardian who is present at the time of the procedure.' },
    { title: 'Health Declaration', text: 'I confirm that I am in good health, I am not under the influence of alcohol or drugs, and I do not have any medical conditions (including but not limited to blood disorders, heart conditions, diabetes, skin conditions, or immunodeficiency) that have not been disclosed to the studio. I understand it is my responsibility to disclose all relevant health information.' },
    { title: 'Allergies & Materials', text: 'I acknowledge that Inkvictus uses professional-grade materials but cannot guarantee against allergic reactions to inks, pigments, metals, or cleaning solutions. I agree that the studio cannot be held responsible for allergic reactions that were not previously known or disclosed.' },
    { title: 'Aftercare Responsibility', text: 'I understand that proper aftercare is essential for healing and final results. I agree to follow all aftercare instructions provided by the studio. I acknowledge that failure to follow aftercare instructions may result in infection, poor healing, or unsatisfactory results, for which the studio shall not be liable.' },
    { title: 'No Refund Policy', text: 'I acknowledge that Inkvictus does not offer refunds for completed services. I understand that the required sessions may vary, and any additional sessions beyond the agreed number will incur a fee for set up. Once a tattoo session has started, the total payment for that session becomes due in full.' },
    { title: 'Indemnification', text: 'I agree to indemnify and hold harmless Inkvictus Tattoo & Piercing Studio, its owners, artists, employees, and agents against any and all claims, expenses, damages, and liabilities arising from or related to the services provided to me.' },
    { title: 'Accuracy of Information', text: 'I confirm that all information provided in this waiver and during my consultation is accurate and truthful. I understand that providing false or misleading information may affect my safety and the outcome of the procedure.' }
];

export default function WaiverPrintView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const isAdmin = location.pathname.startsWith('/admin');

    const [appointment, setAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/admin/appointments/${id}`);
                if (res.data.success && res.data.appointment) {
                    setAppointment(res.data.appointment);
                } else {
                    setError('Appointment not found.');
                }
            } catch (err) {
                console.error('Error fetching waiver data:', err);
                setError('Failed to load waiver data.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div style={s.center}>
                <div style={s.spinner} />
                <p style={{ color: '#64748b', marginTop: '16px' }}>Loading waiver document...</p>
            </div>
        );
    }

    if (error || !appointment) {
        return (
            <div style={s.center}>
                <p style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 600 }}>{error || 'Waiver not found'}</p>
                <button onClick={() => navigate(-1)} style={{ ...s.actionBtn, marginTop: '16px' }}>
                    <ArrowLeft size={16} /> Go Back
                </button>
            </div>
        );
    }

    const a = appointment;
    const bookingCode = getDisplayCode(a.booking_code, a.id);
    const clientName = a.customer_name || a.client_name || a.guest_email || 'Client';
    const waiverDate = a.waiver_accepted_at
        ? new Date(a.waiver_accepted_at.replace(' ', 'T') + '+08:00').toLocaleString('en-US', { 
            dateStyle: 'long', 
            timeStyle: 'short',
            timeZone: 'Asia/Manila'
          })
        : null;
    const appointmentDate = a.appointment_date
        ? new Date(a.appointment_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
        : 'N/A';
    const printDate = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });

    return (
        <div style={s.pageWrapper}>
            {/* Action bar — hidden when printing */}
            <div style={s.actionBar} className="no-print">
                <button onClick={() => navigate(isAdmin ? '/admin/studio' : '/customer/bookings')} style={s.actionBtn}>
                    <ArrowLeft size={16} /> Back
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => window.print()} style={s.printBtn}>
                        <Printer size={16} /> Print Waiver
                    </button>
                </div>
            </div>

            {/* Document */}
            <div style={s.document}>
                {/* Letterhead */}
                <div style={s.letterhead}>
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={s.studioName}>INKVICTUS</h1>
                        <p style={s.studioSub}>TATTOO & PIERCING STUDIO</p>
                        <p style={s.studioAddr}>BGC, Taguig City, Philippines</p>
                    </div>
                    <div style={s.docTitleBox}>
                        <h2 style={s.docTitle}>WAIVER AND RELEASE OF LIABILITY</h2>
                    </div>
                    <div style={s.refRow}>
                        <span style={s.refLabel}>Reference: <strong style={{ color: '#be9055' }}>{bookingCode}</strong></span>
                        <span style={s.refLabel}>Date: <strong>{appointmentDate}</strong></span>
                    </div>
                </div>

                {/* Preamble */}
                <div style={s.preamble}>
                    <p style={{ margin: 0, fontSize: '0.92rem', color: '#334155', lineHeight: 1.7 }}>
                        By agreeing to this waiver, I, <strong>{clientName}</strong>, hereby acknowledge and agree to the
                        following terms in connection with the tattoo and/or piercing services to be performed
                        at <strong>Inkvictus Tattoo and Piercing Studio</strong>.
                    </p>
                </div>

                {/* Waiver Sections */}
                <div style={{ padding: '24px 36px' }}>
                    {WAIVER_SECTIONS.map((section, idx) => (
                        <div key={idx} style={{ marginBottom: '18px' }}>
                            <h4 style={s.sectionTitle}>
                                <span style={s.sectionNum}>{idx + 1}</span>
                                {section.title}
                            </h4>
                            <p style={s.sectionText}>{section.text}</p>
                            {section.highlight && (
                                <div style={s.highlightBox}>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#991b1b', fontWeight: 600, lineHeight: 1.6 }}>
                                        IMPORTANT: {section.highlight}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Signature / Acceptance Block */}
                <div style={s.acceptanceBlock}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Electronic Acceptance Record</h3>
                    <div style={s.sigGrid}>
                        <div style={s.sigField}>
                            <span style={s.sigLabel}>Client Name</span>
                            <span style={s.sigValue}>{clientName}</span>
                        </div>
                        <div style={s.sigField}>
                            <span style={s.sigLabel}>Booking Reference</span>
                            <span style={{ ...s.sigValue, color: '#be9055', fontFamily: 'monospace' }}>{bookingCode}</span>
                        </div>
                        <div style={s.sigField}>
                            <span style={s.sigLabel}>Service Type</span>
                            <span style={s.sigValue}>{a.service_type || 'Consultation'}</span>
                        </div>
                        <div style={s.sigField}>
                            <span style={s.sigLabel}>Appointment Date</span>
                            <span style={s.sigValue}>{appointmentDate}</span>
                        </div>
                        <div style={{ ...s.sigField, gridColumn: '1 / -1' }}>
                            <span style={s.sigLabel}>Waiver Accepted</span>
                            {waiverDate ? (
                                <span style={{ ...s.sigValue, color: '#16a34a' }}>Electronically accepted on {waiverDate}</span>
                            ) : (
                                <span style={{ ...s.sigValue, color: '#dc2626' }}>No waiver acceptance on record</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={s.docFooter}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
                        This document was electronically accepted via the InkVistAR Platform. It constitutes a binding legal agreement
                        with the same force and effect as a handwritten signature. Document generated on {printDate}.
                    </p>
                </div>
            </div>

            {/* Print-only CSS */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

const s = {
    pageWrapper: { minHeight: '100vh', background: '#f1f5f9', padding: '20px', fontFamily: "'Inter', -apple-system, sans-serif" },
    center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
    spinner: { width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#be9055', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
    actionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto 20px', padding: '0 4px' },
    actionBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
    printBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #be9055, #a07840)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(190,144,85,0.3)' },
    document: { maxWidth: '800px', margin: '0 auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden', border: '1px solid #e2e8f0' },
    letterhead: { background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)', padding: '32px 36px 24px', borderBottom: '3px solid #be9055' },
    studioName: { margin: '0', fontSize: '2rem', fontWeight: 800, color: '#be9055', letterSpacing: '0.15em', fontFamily: "'Playfair Display', serif" },
    studioSub: { margin: '2px 0 0', fontSize: '0.72rem', color: '#94a3b8', letterSpacing: '0.2em', fontWeight: 600 },
    studioAddr: { margin: '8px 0 20px', fontSize: '0.78rem', color: '#64748b' },
    docTitleBox: { textAlign: 'center', padding: '12px 0', borderTop: '1px solid rgba(190,144,85,0.3)', borderBottom: '1px solid rgba(190,144,85,0.3)', margin: '0 0 16px' },
    docTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f1f1f1', letterSpacing: '0.08em', textTransform: 'uppercase' },
    refRow: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
    refLabel: { fontSize: '0.82rem', color: '#94a3b8' },
    preamble: { padding: '24px 36px', background: '#fefce8', borderBottom: '1px solid #fde68a' },
    sectionTitle: { margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' },
    sectionNum: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: '#be9055', color: '#fff', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 },
    sectionText: { margin: 0, fontSize: '0.86rem', color: '#475569', lineHeight: 1.65, paddingLeft: '34px' },
    highlightBox: { margin: '8px 0 0', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '6px', marginLeft: '34px' },
    acceptanceBlock: { margin: '0 36px 24px', padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' },
    sigGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
    sigField: { display: 'flex', flexDirection: 'column', gap: '4px' },
    sigLabel: { fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
    sigValue: { fontSize: '0.92rem', fontWeight: 600, color: '#1e293b', padding: '8px 0', borderBottom: '1px solid #e2e8f0' },
    docFooter: { padding: '20px 36px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }
};
