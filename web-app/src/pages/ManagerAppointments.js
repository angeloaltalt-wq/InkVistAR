import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import ManagerSideNav from '../components/ManagerSideNav';
import Pagination from '../components/Pagination';
import './PortalStyles.css';
import { API_URL } from '../config';

function ManagerAppointments() {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/admin/appointments`);
                if (res.data.success) {
                    const mapped = res.data.data.map(apt => ({
                        id: apt.id,
                        client: apt.client_name,
                        artist: apt.artist_name,
                        date: new Date(apt.appointment_date).toLocaleDateString(),
                        status: apt.status
                    }));
                    setAppointments(mapped);
                }
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
                    <h1>Appointments (Manager)</h1>
                </header>

                <div className="portal-content">
                    {loading ? (
                        <div className="no-data">Loading appointments...</div>
                    ) : (
                        <div className="data-card">
                            <h2>Recent Appointments</h2>
                            <div className="table-responsive">
                                <table className="portal-table">
                                    <thead>
                                        <tr>
                                            <th>Client</th>
                                            <th>Artist</th>
                                            <th>Date</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {appointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(a => (
                                            <tr key={a.id}>
                                                <td>{a.client}</td>
                                                <td>{a.artist}</td>
                                                <td>{a.date}</td>
                                                <td>{a.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {appointments.length > 0 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={Math.ceil(appointments.length / itemsPerPage)}
                                    onPageChange={setCurrentPage}
                                    itemsPerPage={itemsPerPage}
                                    onItemsPerPageChange={(newVal) => {
                                        setItemsPerPage(newVal);
                                        setCurrentPage(1);
                                    }}
                                    totalItems={appointments.length}
                                    unit="appointments"
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ManagerAppointments;
