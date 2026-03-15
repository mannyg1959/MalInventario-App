/**
 * MalInventario Móvil - Especializado para Toma de Inventario
 */

const state = {
    config: {
        baseId: localStorage.getItem('airtable_base_id') || '',
        apiKey: localStorage.getItem('airtable_api_key') || ''
    },
    equipments: [],
    brands: [],
    categories: [],
    statuses: [],
    currentEditId: null,
    searchQuery: ''
};

const api = {
        const cleanBaseId = state.config.baseId.trim().split(' ')[0]; // Limpieza estricta
        const cleanApiKey = state.config.apiKey.trim().split(' ')[0];
        
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const baseUrl = isMeta ? 'https://api.airtable.com/v0/meta/bases' : 'https://api.airtable.com/v0';
        const url = `${baseUrl}/${cleanBaseId}${cleanPath}`;
        
        const headers = { 
            'Authorization': `Bearer ${cleanApiKey}`, 
            'Content-Type': 'application/json' 
        };
        
        try {
            const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : null });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errorMsg = result.error?.message || `Error ${response.status}`;
                throw new Error(`${errorMsg} (URL: ${cleanPath})`);
            }
            return result;
        } catch (err) {
            console.error("API Error:", err);
            throw err;
        }
    },
    async getAll(table) { return (await this.request(`/${table}`)).records || []; },
    async create(table, fields) { return await this.request(`/${table}`, 'POST', { fields }); },
    async update(table, id, fields) { return await this.request(`/${table}/${id}`, 'PATCH', { fields }); },
    async delete(table, id) { return await this.request(`/${table}/${id}`, 'DELETE'); },
    async getTables() { return await this.request('/tables', 'GET', null, true); }
};

const ui = {
    init() {
        this.bindEvents();
        if (!state.config.baseId) {
            this.showConfigModal();
        } else {
            this.loadInitialData();
        }
    },

    async loadInitialData() {
        try {
            await this.refreshMetadata();
            await this.refreshInventory();
        } catch (e) {
            console.error(e);
        }
    },

    async refreshMetadata() {
        try {
            const meta = await api.getTables();
            const assetTable = meta.tables.find(t => t.name === 'Assets');
            const brandsTable = await api.getAll('Marcas');
            
            state.brands = brandsTable.map(b => b.fields.Nombre || b.fields.Name).filter(Boolean).sort();

            if (assetTable) {
                const catField = assetTable.fields.find(f => f.name === 'Categoría');
                if (catField?.options?.choices) {
                    state.categories = catField.options.choices.map(c => c.name);
                }

                const statusField = assetTable.fields.find(f => f.name === 'Estado');
                if (statusField?.options?.choices) {
                    state.statuses = statusField.options.choices.map(c => c.name);
                }
            }

            this.populateSelects();
        } catch (e) { 
            console.error("Meta error:", e); 
        }
    },

    populateSelects() {
        const brandSel = document.getElementById('mob-brand');
        brandSel.innerHTML = '<option value="">-- Seleccionar --</option>' + 
            state.brands.map(b => `<option value="${b}">${b}</option>`).join('');

        const catSel = document.getElementById('mob-cat');
        catSel.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');

        const statusSel = document.getElementById('mob-status');
        statusSel.innerHTML = state.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    async refreshInventory() {
        const listContainer = document.getElementById('mob-inventory-list');
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div><p>Sincronizando...</p></div>';
        
        try {
            // Intentar cargar la tabla 'Assets'
            try {
                state.equipments = await api.getAll('Assets');
            } catch (err) {
                // Si falla (404), intentar buscar la tabla en los metadatos
                console.log("Tabla 'Assets' no encontrada, buscando alternativa...");
                const meta = await api.getTables();
                const table = meta.tables.find(t => t.name.toLowerCase().includes('asset') || t.name === 'Equipos' || t.name === 'Inventario');
                if (table) {
                    state.equipments = await api.getAll(table.name);
                } else {
                    throw err; // Si no hay ni tabla ni alternativa, lanzar error original
                }
            }
            this.renderList();
        } catch (e) {
            listContainer.innerHTML = `<div class="loader-container">
                <p>Error al cargar datos.</p>
                <p style="font-size:0.7rem; color:red; margin-top:10px;">Detalle: ${e.message}</p>
                <button onclick="ui.showConfigModal()" class="btn btn-primary-mobile" style="margin-top:15px; background:#ef4444">Revisar Configuración</button>
            </div>`;
        }
    },

    renderList() {
        const listContainer = document.getElementById('mob-inventory-list');
        const countLabel = document.getElementById('items-count');
        
        const filtered = state.equipments.filter(e => {
            const search = state.searchQuery.toLowerCase();
            return (e.fields.ID || '').toLowerCase().includes(search) ||
                   (e.fields.Marca || '').toLowerCase().includes(search) ||
                   (e.fields.Modelo || '').toLowerCase().includes(search) ||
                   (e.fields['Número de Serie'] || '').toLowerCase().includes(search);
        });

        // Ordenar por ID descendente (más recientes arriba)
        filtered.sort((a, b) => {
            const idA = parseInt((a.fields.ID || '').replace('MAL', '')) || 0;
            const idB = parseInt((b.fields.ID || '').replace('MAL', '')) || 0;
            return idB - idA;
        });

        countLabel.innerText = `${filtered.length} EQUIPOS ENCONTRADOS`;

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="loader-container"><p>No se encontraron equipos.</p></div>';
            return;
        }

        listContainer.innerHTML = filtered.map(e => {
            const img = e.fields.Foto?.[0]?.url || '';
            const status = e.fields.Estado || 'Disponible';
            const statusClass = `badge-${status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '')}`;
            
            return `
                <div class="asset-card" data-id="${e.id}">
                    <div class="asset-card-img" onclick="ui.previewImage('${img}')">
                        ${img ? `<img src="${img}">` : `<i class="fas fa-laptop"></i>`}
                    </div>
                    <div class="asset-card-content">
                        <div class="card-top">
                            <div>
                                <span class="asset-id">${e.fields.ID || '-'}</span>
                                <span class="card-title">${e.fields.Marca || ''} ${e.fields.Modelo || ''}</span>
                            </div>
                            <span class="badge ${statusClass}">${status}</span>
                        </div>
                        <div class="card-meta">
                            <i class="fas fa-barcode"></i> ${(e.fields['Número de Serie'] || 'S/N').slice(0,15)}...
                            <br>
                            <i class="fas fa-tag"></i> ${e.fields.Categoría || '-'}
                        </div>
                        <div class="card-footer">
                            <div class="card-date">${e.fields['Fecha de Compra'] || '-'}</div>
                            <div class="card-actions">
                                <button class="action-dot action-edit" onclick="ui.editAsset('${e.id}')">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button class="action-dot action-delete" onclick="ui.deleteAsset('${e.id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    bindEvents() {
        // Toggle Form
        document.getElementById('toggle-form').onclick = () => {
            const content = document.getElementById('asset-form-container');
            const header = document.getElementById('toggle-form');
            content.classList.toggle('hidden');
            header.classList.toggle('open');
            
            if (!content.classList.contains('hidden') && !state.currentEditId) {
                document.getElementById('mob-id').value = this.generateNextMalId();
            }
        };

        // Form Submit
        document.getElementById('mobile-asset-form').onsubmit = async (e) => {
            e.preventDefault();
            await this.saveAsset();
        };

        // Cancel Edit
        document.getElementById('mob-btn-cancel').onclick = () => this.resetForm();

        // Image URL Preview
        const imgInput = document.getElementById('mob-img');
        const handleImgChange = () => {
            const url = this.formatImageUrl(imgInput.value);
            const preview = document.getElementById('mob-preview-box');
            if (url) {
                preview.innerHTML = `<img src="${url}" onerror="this.src=''; ui.showToast('Enlace no válido','error')">`;
            } else {
                preview.innerHTML = `<i class="fas fa-camera"></i><p>Pegue un enlace abajo</p>`;
            }
        };
        imgInput.oninput = handleImgChange;

        // Search
        document.getElementById('mob-search').oninput = (e) => {
            state.searchQuery = e.target.value;
            this.renderList();
        };

        // Header actions
        document.getElementById('btn-refresh').onclick = () => this.refreshInventory();
        document.getElementById('btn-config').onclick = () => this.showConfigModal();
        document.getElementById('close-mob-modal').onclick = () => this.closeModal();
    },

    async saveAsset() {
        const btn = document.getElementById('mob-btn-save');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';

        try {
            const fields = {
                'Marca': document.getElementById('mob-brand').value,
                'Modelo': 'Genérico', // Podemos simplificar o añadir campo si se desea
                'Categoría': document.getElementById('mob-cat').value,
                'Número de Serie': document.getElementById('mob-sn').value,
                'Estado': document.getElementById('mob-status').value,
                'Descripción': document.getElementById('mob-desc').value,
                'Fecha de Compra': document.getElementById('mob-purchase').value || null,
                'Nombre': `${document.getElementById('mob-brand').value} Genérico`
            };

            const imgUrl = this.formatImageUrl(document.getElementById('mob-img').value);
            if (imgUrl) fields['Foto'] = [{ url: imgUrl }];

            if (state.currentEditId) {
                await api.update('Assets', state.currentEditId, fields);
                this.showToast('✅ Equipo actualizado');
            } else {
                fields['ID'] = this.generateNextMalId();
                await api.create('Assets', fields);
                this.showToast('✅ Nuevo equipo registrado');
            }

            this.resetForm();
            await this.refreshInventory();
        } catch (e) {
            this.showToast('❌ Error al guardar', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    editAsset(id) {
        const asset = state.equipments.find(e => e.id === id);
        if (!asset) return;

        state.currentEditId = id;
        
        // Abrir formulario si está cerrado
        const content = document.getElementById('asset-form-container');
        if (content.classList.contains('hidden')) document.getElementById('toggle-form').click();

        // Llenar datos
        document.getElementById('mob-id').value = asset.fields.ID || '';
        document.getElementById('mob-brand').value = asset.fields.Marca || '';
        document.getElementById('mob-sn').value = asset.fields['Número de Serie'] || '';
        document.getElementById('mob-cat').value = asset.fields.Categoría || '';
        document.getElementById('mob-status').value = asset.fields.Estado || '';
        document.getElementById('mob-purchase').value = asset.fields['Fecha de Compra'] || '';
        document.getElementById('mob-desc').value = asset.fields.Descripción || '';
        const img = asset.fields.Foto?.[0]?.url || '';
        document.getElementById('mob-img').value = img;
        
        // Preview
        const preview = document.getElementById('mob-preview-box');
        preview.innerHTML = img ? `<img src="${img}">` : `<i class="fas fa-camera"></i><p>Pegue un enlace abajo</p>`;

        // UI Changes
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-check"></i> ACTUALIZAR ITEM';
        document.getElementById('mob-btn-cancel').classList.remove('hidden');
        document.getElementById('toggle-form').querySelector('h3').innerHTML = '<i class="fas fa-edit"></i> Editando Item';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteAsset(id) {
        if (!confirm('¿Seguro que quieres eliminar este equipo?')) return;
        try {
            await api.delete('Assets', id);
            this.showToast('🗑️ Eliminado correctamente');
            await this.refreshInventory();
        } catch (e) {}
    },

    resetForm() {
        state.currentEditId = null;
        document.getElementById('mobile-asset-form').reset();
        document.getElementById('mob-preview-box').innerHTML = `<i class="fas fa-camera"></i><p>Pegue un enlace abajo</p>`;
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-save"></i> GUARDAR REGISTRO';
        document.getElementById('mob-btn-cancel').classList.add('hidden');
        document.getElementById('toggle-form').querySelector('h3').innerHTML = '<i class="fas fa-plus-circle"></i> Registrar Nuevo Item';
        document.getElementById('mob-id').value = this.generateNextMalId();
    },

    generateNextMalId() {
        const ids = state.equipments.map(e => parseInt((e.fields.ID || '').replace('MAL', '')) || 0);
        return `MAL${(Math.max(...ids, 0) + 1).toString().padStart(3, '0')}`;
    },

    formatImageUrl(url) {
        if (!url) return '';
        url = url.trim();
        if (url.includes('drive.google.com')) {
            const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.match(/id=([a-zA-Z0-9_-]+)/)?.[1];
            if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
        }
        if (url.includes('dropbox.com')) {
            return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('&dl=0', '');
        }
        return url;
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('mob-toast');
        toast.innerText = msg;
        toast.style.background = type === 'error' ? 'var(--error)' : '#1e293b';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    },

    showConfigModal() {
        const modal = document.getElementById('mob-modal-overlay');
        const body = document.getElementById('mob-modal-body');
        document.getElementById('mob-modal-title').innerText = "Conexión Airtable";
        
        body.innerHTML = `
            <div class="field-group">
                <label>Base ID</label>
                <input type="text" id="config-base" value="${state.config.baseId}" placeholder="app...">
            </div>
            <div class="field-group">
                <label>API Key / Token</label>
                <input type="password" id="config-key" value="${state.config.apiKey}" placeholder="pat...">
            </div>
            <button id="save-config" class="btn btn-primary-mobile">CONECTAR</button>
        `;

        modal.classList.remove('hidden');

            const bid = document.getElementById('config-base').value.trim();
            const key = document.getElementById('config-key').value.trim();
            if(!bid || !key) return alert('Por favor, rellene ambos campos.');
            
            // Guardar con limpieza extra
            const finalBid = bid.replace(/\s/g, ''); 
            const finalKey = key.replace(/\s/g, '');

            localStorage.setItem('airtable_base_id', finalBid);
            localStorage.setItem('airtable_api_key', finalKey);
            state.config.baseId = finalBid;
            state.config.apiKey = finalKey;
            
            this.closeModal();
            location.reload(); // Recarga real para asegurar que todo el estado se limpie
        };
    },

    closeModal() {
        document.getElementById('mob-modal-overlay').classList.add('hidden');
    },

    previewImage(url) {
        if(!url) return;
        // Podríamos abrir un modal con la imagen grande
        this.showToast('Abriendo imagen...');
        window.open(url, '_blank');
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => ui.init());
