const fs = require('fs');
const path = './src/pages/Gallery.js';

let code = fs.readFileSync(path, 'utf8');

// 1. Add artistsList state
code = code.replace(
  "const [selectedArtist, setSelectedArtist] = useState(null);",
  "const [activeArtistId, setActiveArtistId] = useState('All');\n  const [artistsList, setArtistsList] = useState([]);"
);

// 2. Add useEffect to fetch artists
const fetchArtistsCode = `
  // Fetch artists
  useEffect(() => {
    fetch(\`\${API_URL}/api/customer/artists\`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.artists) {
          const activeArtists = data.artists.filter(a => a.portfolio_count > 0);
          setArtistsList(activeArtists);
        }
      })
      .catch(err => console.error('Error fetching artists:', err));
  }, []);
`;
code = code.replace("// Fetch categories from backend", fetchArtistsCode + "\n  // Fetch categories from backend");

// 3. Update query params effect for artist
code = code.replace(
  /  \/\/ Parse query params for artist filter\s+useEffect\(\(\) => \{[\s\S]*?\}, \[location\.search\]\);/,
  `  // Parse query params for artist filter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const artistId = params.get('artistId');
    
    if (artistId) {
      setActiveArtistId(artistId);
    } else {
      setActiveArtistId('All');
    }
  }, [location.search]);`
);

// 4. Update fetch works effect
code = code.replace(
  /    \/\/ If we have an artistId in the URL[\s\S]*?if \(artistIdInUrl && \(\!selectedArtist \|\| selectedArtist\.id \!\=\= artistIdInUrl\)\) \{\n      return;\n    \}/,
  ``
);

code = code.replace(
  /    if \(selectedArtist\) \{\n      queryParams\.append\('artistId', selectedArtist\.id\);\n    \}/,
  `    if (activeArtistId && activeArtistId !== 'All') {
      queryParams.append('artistId', activeArtistId);
    }`
);

code = code.replace(
  /  \}, \[activeCategory, selectedArtist, location\.search, debouncedPriceRange\]\);/,
  `  }, [activeCategory, activeArtistId, location.search, debouncedPriceRange]);`
);

code = code.replace(
  /  \}, \[activeCategory, selectedArtist, debouncedPriceRange\]\);/,
  `  }, [activeCategory, activeArtistId, debouncedPriceRange]);`
);

// 5. Update header title and remove artist badge
code = code.replace(
  /        <h1>\{selectedArtist \? `PORTFOLIO: \$\{selectedArtist\.name\.toUpperCase\(\)\}` : 'OUR ARTWORK SPEAKS VOLUMES'\}<\/h1>[\s\S]*?        \{selectedArtist && \([\s\S]*?        \)\}/,
  `        <h1>OUR ARTWORK SPEAKS VOLUMES</h1>`
);

// 6. Add Artist dropdown to filter nav
const artistSelectCode = `            <select
              value={activeArtistId}
              onChange={(e) => setActiveArtistId(e.target.value)}
              style={{
                padding: '8px 20px',
                paddingRight: '40px',
                borderRadius: '50px',
                border: '1px solid #be9055',
                background: '#1a1a1a',
                color: '#be9055',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.3s ease',
                minWidth: '150px',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: \`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23C19A6B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")\`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                marginLeft: '10px'
              }}
            >
              <option value="All">All Artists</option>
              {artistsList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>`;

code = code.replace(
  /            <\/select>/,
  `            </select>\n${artistSelectCode}`
);

fs.writeFileSync(path, code);
console.log('Gallery.js updated');
