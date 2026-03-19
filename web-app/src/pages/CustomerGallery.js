import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';

function CustomerGallery(){
    const [works, setWorks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(()=>{
        const fetch = async ()=>{
            try{
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/gallery/works`);
                if (res.data.success) setWorks(res.data.works || []);
                setLoading(false);
            }catch(e){console.error(e); setLoading(false);}        
        };
        fetch();
    },[]);

    const filteredWorks = works.filter(w => 
        w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.artist_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
            <header className="portal-header">
                <h1>Inspiration Gallery</h1>
                <div className="search-box" style={{maxWidth: '300px'}}>
                    <input 
                        type="text" 
                        placeholder="Search tattoos..." 
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>
            <div className="portal-content">
                {loading ? <div className="no-data">Loading...</div> : (
                    <div className="gallery-grid">
                        {filteredWorks.length ? filteredWorks.map(work => (
                            <div key={work.id} className="gallery-item">
                                <img src={work.image_url} alt={work.title} />
                                <div className="gallery-info">
                                    <h3>{work.title}</h3>
                                    <p className="artist-tag">by {work.artist_name}</p>
                                    {work.price_estimate && <p style={{color: '#daa520', fontWeight: '600', fontSize: '0.85rem', margin: '4px 0 0'}}>₱{Number(work.price_estimate).toLocaleString()} est.</p>}
                                </div>
                            </div>
                        )) : <p className="no-data">No works found</p>}
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default CustomerGallery;
