import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import ManagerSideNav from '../components/ManagerSideNav';
import Pagination from '../components/Pagination';
import './PortalStyles.css';
import { API_URL } from '../config';

function ManagerUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/debug/users`);
                if (res.data.success) setUsers((res.data.users || []).filter(u => !u.is_deleted));
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        fetch();
    }, []);

    return (
        <div className="portal-layout">
            <ManagerSideNav />
            <div className="portal-container manager-portal">
                <header className="portal-header">
                    <h1>Users (Manager View)</h1>
                </header>

                <div className="portal-content">
                    {loading ? (
                        <div className="no-data">Loading users...</div>
                    ) : (
                        <div className="data-card">
                            <h2>User Directory (read-only)</h2>
                            <div className="table-responsive">
                                <table className="portal-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(u => (
                                            <tr key={u.id}>
                                                <td>#{u.id}</td>
                                                <td>{u.name}</td>
                                                <td>{u.email}</td>
                                                <td>{u.user_type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {users.length > 0 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={Math.ceil(users.length / itemsPerPage)}
                                    onPageChange={setCurrentPage}
                                    itemsPerPage={itemsPerPage}
                                    onItemsPerPageChange={(newVal) => {
                                        setItemsPerPage(newVal);
                                        setCurrentPage(1);
                                    }}
                                    totalItems={users.length}
                                    unit="users"
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ManagerUsers;
