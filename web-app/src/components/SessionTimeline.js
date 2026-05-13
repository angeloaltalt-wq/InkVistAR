import React, { useState } from 'react';
import { CheckCircle, Circle, Clock, ChevronDown, ChevronUp, Layers, AlertTriangle } from 'lucide-react';
import Axios from 'axios';
import { API_URL } from '../config';

/**
 * SessionTimeline — Feature B
 *
 * Props:
 *   project        {object}  — The project object from GET /api/projects/:id
 *                              (includes .sessions[], .status, .total_sessions_planned, .total_sessions_actual)
 *   currentSessionId {number} — The appointment id currently open (to highlight the active node)
 *   isAdmin        {boolean} — Show "Mark Complete Early" button when true
 *   onProjectUpdated {fn}    — Callback after a successful complete-early action
 *   onSessionSelect {fn}     — Callback when a node is clicked
 *   loading        {boolean} — Show skeleton while fetching
 */
export default function SessionTimeline({
    project,
    currentSessionId,
    isAdmin = false,
    onProjectUpdated,
    onSessionSelect,
    loading = false
}) {
    const [completingEarly, setCompletingEarly] = useState(false);
    const [showConfirmEarly, setShowConfirmEarly] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    if (loading) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.header}>
                    <Layers size={14} style={{ color: '#be9055' }} />
                    <span style={styles.headerLabel}>Project Timeline</span>
                </div>
                <div style={styles.skeletonRail}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={styles.skeletonNode} />
                    ))}
                </div>
            </div>
        );
    }

    if (!project) return null;

    const { sessions = [], status, total_sessions_planned, total_sessions_actual, design_title } = project;

    // Build the full node list: real sessions + planned placeholders
    const realMax = sessions.reduce((max, s) => Math.max(max, s.session_number || 0), 0);
    const planned = Math.max(total_sessions_planned || 1, realMax);

    const nodes = Array.from({ length: planned }, (_, i) => {
        const num = i + 1;
        const session = sessions.find(s => (s.session_number || 0) === num);
        return { num, session };
    });

    const isCompleted = status === 'completed' || status === 'completed_early';
    const currentSession = sessions.find(s => s.id === currentSessionId);

    // "Complete Early" eligibility: admin only, project active, at least one session done
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const lastCompletedNum = completedSessions.reduce((max, s) => Math.max(max, s.session_number || 0), 0);
    const hasActiveUpcomingSessions = sessions.some(s => 
        s.session_number > lastCompletedNum && 
        ['pending', 'confirmed', 'in_progress'].includes(s.status)
    );

    const canCompleteEarly = isAdmin
        && !isCompleted
        && lastCompletedNum > 0
        && lastCompletedNum < planned
        && !hasActiveUpcomingSessions;

    const handleCompleteEarly = async () => {
        setCompletingEarly(true);
        try {
            await Axios.put(`${API_URL}/api/projects/${project.id}/complete`, {
                early: true,
                actual_sessions: lastCompletedNum
            });
            setShowConfirmEarly(false);
            if (onProjectUpdated) onProjectUpdated();
        } catch (e) {
            console.error('Failed to complete project early:', e);
        } finally {
            setCompletingEarly(false);
        }
    };

    const getNodeState = (node) => {
        if (!node.session) return 'planned';
        if (node.session.status === 'completed') return 'completed';
        if (node.session.id === currentSessionId) return 'current';
        return 'active'; // confirmed/in_progress/pending but not the current view
    };

    const statusPill = isCompleted
        ? { label: status === 'completed_early' ? 'Completed Early' : 'Completed', bg: '#14532d', color: '#86efac' }
        : { label: 'Active', bg: 'rgba(190,144,85,0.12)', color: '#be9055' };

    return (
        <div style={styles.wrapper}>
            {/* Header row */}
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={14} style={{ color: '#be9055' }} />
                    <span style={styles.headerLabel}>Project Timeline</span>
                    {design_title && <span style={styles.designTitle}>{design_title}</span>}
                    <span style={{ ...styles.statusPill, background: statusPill.bg, color: statusPill.color }}>
                        {statusPill.label}
                    </span>
                    {total_sessions_actual && (
                        <span style={styles.muted}>
                            Completed in {total_sessions_actual} of {planned} sessions
                        </span>
                    )}
                </div>
                <button
                    style={styles.collapseBtn}
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                    aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                >
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
            </div>

            {!collapsed && (
                <>
                    {/* Rail */}
                    <div style={styles.rail}>
                        {nodes.map((node, idx) => {
                            const state = getNodeState(node);
                            const isClickable = node.session && node.session.id !== currentSessionId;
                            return (
                                <React.Fragment key={node.num}>
                                    {/* Connector line (before node, except first) */}
                                    {idx > 0 && (
                                        <div style={{
                                            ...styles.connector,
                                            background: state === 'planned' ? '#cbd5e1' : '#be9055'
                                        }} />
                                    )}
                                    
                                    <div 
                                        style={{
                                            ...styles.nodeWrapper,
                                            cursor: isClickable ? 'pointer' : 'default',
                                            opacity: isClickable ? 0.9 : 1
                                        }} 
                                        title={node.session
                                            ? `Session ${node.num} — ${node.session.status} — ${node.session.appointment_date || 'TBD'}` + (isClickable ? ' (Click to view)' : '')
                                            : `Session ${node.num} — Planned`
                                        }
                                        onClick={() => {
                                            if (isClickable && onSessionSelect) {
                                                onSessionSelect(node.session.id);
                                            } else if (isClickable && window.handleTimelineSessionSelect) {
                                                window.handleTimelineSessionSelect(node.session.id);
                                            }
                                        }}
                                    >
                                        {/* Node circle */}
                                        <div style={{
                                            ...styles.nodeCircle,
                                            ...(state === 'completed' ? styles.nodeCompleted : {}),
                                            ...(state === 'current' ? styles.nodeCurrent : {}),
                                            ...(state === 'active' ? styles.nodeActive : {}),
                                            ...(state === 'planned' ? styles.nodePlanned : {}),
                                        }}>
                                            {state === 'completed' && <CheckCircle size={15} style={{ color: '#be9055' }} />}
                                            {(state === 'current' || state === 'active') && (
                                                <span style={styles.nodeNumber}>{node.num}</span>
                                            )}
                                            {state === 'planned' && <Circle size={12} style={{ color: '#94a3b8', strokeWidth: 2 }} />}
                                        </div>
                                        
                                        {/* Label below */}
                                        <div style={styles.nodeLabel}>
                                            <span style={{
                                                ...styles.nodeLabelNum,
                                                color: state === 'planned' ? '#64748b' : state === 'completed' ? '#92400e' : state === 'current' ? '#b45309' : '#4338ca'
                                            }}>
                                                S{node.num}
                                            </span>
                                            {node.session?.appointment_date && (
                                                <span style={styles.nodeLabelDate}>
                                                    {new Date(node.session.appointment_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Session summary strip */}
                    {sessions.length > 0 && (
                        <div style={styles.summaryStrip}>
                            <Clock size={11} style={{ color: '#64748b', flexShrink: 0 }} />
                            <span style={styles.muted}>
                                {completedSessions.length} of {planned} sessions completed
                                {currentSession && ` · Session ${currentSession.session_number} currently open`}
                            </span>
                        </div>
                    )}

                    {/* Complete Early */}
                    {canCompleteEarly && !showConfirmEarly && (
                        <button style={styles.completeEarlyBtn} onClick={() => setShowConfirmEarly(true)} title="Mark this project as complete before the planned session count">
                            <AlertTriangle size={13} />
                            Mark Project Complete Early
                        </button>
                    )}

                    {showConfirmEarly && (
                        <div style={styles.earlyConfirmBox}>
                            <p style={styles.earlyConfirmText}>
                                This project was planned for <strong>{planned}</strong> sessions but completed in <strong>{lastCompletedNum}</strong>.
                                Mark as done?
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    style={styles.earlyConfirmYes}
                                    onClick={handleCompleteEarly}
                                    disabled={completingEarly}
                                    title="Confirm: mark this project as completed early"
                                >
                                    {completingEarly ? 'Saving...' : 'Yes, Complete Early'}
                                </button>
                                <button
                                    style={styles.earlyConfirmNo}
                                    onClick={() => setShowConfirmEarly(false)}
                                    title="Cancel — keep project active"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
    wrapper: {
        background: 'linear-gradient(to bottom, #f8fafc, #f1f5f9)',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '18px 24px',
        marginBottom: 24,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12
    },
    headerLabel: {
        fontSize: 13,
        fontWeight: 700,
        color: '#be9055',
        letterSpacing: '0.8px',
        textTransform: 'uppercase'
    },
    designTitle: {
        fontSize: 14,
        color: '#334155',
        fontStyle: 'italic',
        fontWeight: 600
    },
    statusPill: {
        fontSize: 11,
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: 20,
        letterSpacing: '0.4px',
        border: '1px solid transparent'
    },
    muted: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: 500
    },
    collapseBtn: {
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '5px 9px',
        color: '#475569',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    rail: {
        display: 'flex',
        alignItems: 'flex-start',
        overflowX: 'auto',
        paddingBottom: 12,
        gap: 0,
        paddingTop: 8
    },
    nodeWrapper: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        flexShrink: 0
    },
    connector: {
        width: 36,
        height: 3,
        borderRadius: 2,
        flexShrink: 0,
        marginTop: 16
    },
    nodeCircle: {
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    },
    nodeCompleted: {
        background: '#fffbeb',
        border: '2px solid #be9055'
    },
    nodeCurrent: {
        background: '#ffffff',
        border: '2.5px solid #f59e0b',
        boxShadow: '0 0 0 4px rgba(245,158,11,0.15)'
    },
    nodeActive: {
        background: '#e0e7ff',
        border: '2px solid #6366f1'
    },
    nodePlanned: {
        background: '#f8fafc',
        border: '2px dashed #cbd5e1',
        boxShadow: 'none'
    },
    nodeNumber: {
        fontSize: 13,
        fontWeight: 700,
        color: '#1e293b'
    },
    nodeLabel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 10,
        gap: 2
    },
    nodeLabelNum: {
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.5px'
    },
    nodeLabelDate: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: 500
    },
    summaryStrip: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        paddingTop: 14,
        borderTop: '1px solid #e2e8f0'
    },
    completeEarlyBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        padding: '8px 16px',
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        color: '#b45309',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 2px rgba(245,158,11,0.05)'
    },
    earlyConfirmBox: {
        marginTop: 14,
        padding: '16px 20px',
        background: '#fefce8',
        border: '1px solid #fde047',
        borderRadius: 12,
        boxShadow: '0 4px 6px -1px rgba(234,179,8,0.1)'
    },
    earlyConfirmText: {
        fontSize: 13,
        color: '#854d0e',
        marginBottom: 12,
        lineHeight: 1.6
    },
    earlyConfirmYes: {
        padding: '8px 18px',
        background: 'linear-gradient(135deg, #be9055, #a07840)',
        border: 'none',
        borderRadius: 8,
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(190,144,85,0.3)'
    },
    earlyConfirmNo: {
        padding: '8px 18px',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        color: '#475569',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer'
    },
    skeletonRail: {
        display: 'flex',
        gap: 16,
        paddingBottom: 8
    },
    skeletonNode: {
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: '#e2e8f0',
        animation: 'pulse 1.5s ease infinite'
    }
};
