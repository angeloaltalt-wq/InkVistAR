const fs = require('fs');
const path = './src/pages/CustomerGallery.js';

let code = fs.readFileSync(path, 'utf8');

// 1. Add states
code = code.replace(
  "const [activeCategory, setActiveCategory] = useState('All');",
  `const [activeCategory, setActiveCategory] = useState('All');
    const [activeArtistId, setActiveArtistId] = useState('All');
    const [artistsList, setArtistsList] = useState([]);
    const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
    const [showPriceFilter, setShowPriceFilter] = useState(false);`
);

// 2. Fetch artists
const fetchCode = `
        const fetchArtists = async () => {
            try {
                const res = await Axios.get(\`\${API_URL}/api/customer/artists\`);
                if (res.data.success && res.data.artists) {
                    setArtistsList(res.data.artists.filter(a => a.portfolio_count > 0));
                }
            } catch (e) { console.error(e); }
        };
        fetchArtists();
`;
code = code.replace(
  "fetchCategories();\n    }, []);",
  "fetchCategories();\n" + fetchCode + "    }, []);"
);

// 3. Update filteredItems logic
code = code.replace(
  /const filteredItems = displayItems\.filter\(w => \{\s*const matchesSearch = \[\s\S\]*?matchesCategory;\s*\}\);/,
  `const filteredItems = displayItems.filter(w => {
        const matchesSearch = (w.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (w.artist_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = activeCategory === 'All' || w.category === activeCategory;
        const matchesArtist = activeArtistId === 'All' || w.artist_id?.toString() === activeArtistId;
        
        const price = w.price_estimate ? Number(w.price_estimate) : null;
        const matchesPrice = price === null || (price >= priceRange.min && (priceRange.max >= 500000 || price <= priceRange.max));

        return matchesSearch && matchesCategory && matchesArtist && matchesPrice;
    });`
);

// 4. Update UI: replace {viewMode === 'All' && ...} and inject new UI
const newFilterUI = `{categories.length > 1 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            marginBottom: '20px'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                flexWrap: 'wrap'
                            }}>
                                {/* Style Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        <Filter size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Style:
                                    </label>
                                    <select
                                        value={activeCategory}
                                        onChange={(e) => setActiveCategory(e.target.value)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)',
                                            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', color: '#1e293b',
                                            fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                            minWidth: '150px', appearance: 'none',
                                            backgroundImage: \`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")\`,
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px'
                                        }}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Artist Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        Artist:
                                    </label>
                                    <select
                                        value={activeArtistId}
                                        onChange={(e) => setActiveArtistId(e.target.value)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)',
                                            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', color: '#1e293b',
                                            fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                            minWidth: '150px', appearance: 'none',
                                            backgroundImage: \`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")\`,
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px'
                                        }}
                                    >
                                        <option value="All">All Artists</option>
                                        {artistsList.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Price Range Toggle */}
                                <button
                                    onClick={() => setShowPriceFilter(!showPriceFilter)}
                                    style={{
                                        padding: '8px 16px', borderRadius: '10px', border: showPriceFilter ? '1px solid #be9055' : '1px solid rgba(0,0,0,0.12)',
                                        background: showPriceFilter ? 'rgba(193, 154, 107, 0.1)' : 'rgba(255,255,255,0.85)', color: showPriceFilter ? '#be9055' : '#1e293b',
                                        fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                    }}
                                >
                                    PRICE RANGE
                                </button>
                            </div>

                            {/* Price Slider UI */}
                            {showPriceFilter && (
                                <div style={{ 
                                    background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px', padding: '16px',
                                    maxWidth: '400px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                        <span>ESTIMATED PRICE</span>
                                        <span style={{ color: '#be9055' }}>
                                            ₱{priceRange.min.toLocaleString()} - ₱{priceRange.max.toLocaleString()}{priceRange.max >= 500000 ? '+' : ''}
                                        </span>
                                    </div>
                                    <div style={{ position: 'relative', height: '30px', display: 'flex', alignItems: 'center' }}>
                                        <div style={{ position: 'absolute', width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
                                        <div style={{ 
                                            position: 'absolute', height: '4px', background: '#be9055', borderRadius: '2px',
                                            left: \`\${(priceRange.min / 500000) * 100}%\`, width: \`\${((priceRange.max - priceRange.min) / 500000) * 100}%\`
                                        }} />
                                        <input
                                            type="range" min="0" max="500000" step="5000" value={priceRange.min}
                                            onChange={(e) => {
                                                const val = Math.min(parseInt(e.target.value), priceRange.max - 5000);
                                                setPriceRange({ ...priceRange, min: val });
                                            }}
                                            style={{ position: 'absolute', width: '100%', appearance: 'none', pointerEvents: 'none', background: 'transparent', zIndex: priceRange.min > 400000 ? 5 : 3 }}
                                            className="custom-range-slider"
                                        />
                                        <input
                                            type="range" min="0" max="500000" step="5000" value={priceRange.max}
                                            onChange={(e) => {
                                                const val = Math.max(parseInt(e.target.value), priceRange.min + 5000);
                                                setPriceRange({ ...priceRange, max: val });
                                            }}
                                            style={{ position: 'absolute', width: '100%', appearance: 'none', pointerEvents: 'none', background: 'transparent', zIndex: 4 }}
                                            className="custom-range-slider"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}`;

const startIndex = code.indexOf("{viewMode === 'All' && categories.length > 1 && (");
const endIndex = code.indexOf("{loading ? (");
if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + newFilterUI + "\n\n                    " + code.substring(endIndex);
}

// 5. Add custom CSS for the dual sliders to work correctly in CustomerGallery.js
const cssAppend = `
            <style>
                {\`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .custom-range-slider::-webkit-slider-thumb {
                        pointer-events: all;
                        width: 18px;
                        height: 18px;
                        -webkit-appearance: none;
                        background: white;
                        border: 2px solid #be9055;
                        border-radius: 50%;
                        cursor: pointer;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    }
                \`}
            </style>`;

code = code.replace(
  /<style>[\s\S]*?<\/style>/,
  cssAppend
);

fs.writeFileSync(path, code);
console.log('CustomerGallery.js updated');
