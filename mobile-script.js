/**
 * MalInventario Móvil - Versión de Ultra-Compatibilidad
 */

const state = {
    config: {
        baseId: localStorage.getItem('airtable_base_id') || '',
        apiKey: localStorage.getItem('airtable_api_key') || ''
    },
    equipments: [],
    brands: [],
    categories: ['Laptop', 'Desktop', 'Monitor', 'Periférico', 'Móvil', 'Otro'],
    statuses: ['Disponible', 'Asignado', 'Reparación', 'Baja'],
    currentEditId: null,
    searchQuery: ''
};

const api = {
    async request(path, method = 'GET', data = null, isMeta = false) {
        if (!state.config.baseId || !state.config.apiKey) { 
            throw new Error('CONFIG_MISSING');
        }

        // Limpieza de espacios pero respetando MAYÚSCULAS/minúsculas
        const cleanBaseId = state.config.baseId.trim().replace(/\s/g, ''); 
        const cleanApiKey = state.config.apiKey.trim().replace(/\s/g, '');
        
        const baseUrl = isMeta ? 'https://api.airtable.com/v0/meta/bases' : 'https://api.airtable.com/v0';
        const url = `${baseUrl}/${cleanBaseId}${path}`;
        
        const headers = { 
            'Authorization': `Bearer ${cleanApiKey}`, 
            'Content-Type': 'application/json' 
        };
        
        try {
            const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : null });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(`${result.error?.message || response.status}`);
            }
            return result;
        } catch (err) {
            console.error("API Error:", err);
            throw err;
        }
    },
    async getAll(table) { return (await this.request(`/${encodeURIComponent(table)}`)).records || []; },
    async create(table, fields) { return await this.request(`/${encodeURIComponent(table)}`, 'POST', { fields }); },
    async update(table, id, fields) { return await this.request(`/${encodeURIComponent(table)}/${id}`, 'PATCH', { fields }); },
    async delete(table, id) { return await this.request(`/${encodeURIComponent(table)}/${id}`, 'DELETE'); },
    async getTables() { return await this.request('/tables', 'GET', null, true); }
};

const ui = {
    init() {
        this.bindEvents();
        this.populateSelects(); // Llenar con defaults primero
        if (!state.config.baseId) {
            this.showConfigModal();
        } else {
            this.loadInitialData();
        }
    },

    async loadInitialData() {
        try {
            // Intentamos cargar metadatos pero si falla no bloqueamos la app
            await this.refreshMetadata().catch(e => console.warn("Usando categorías por defecto"));
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
            
            if (brandsTable.length > 0) {
                state.brands = brandsTable.map(b => b.fields.Nombre || b.fields.Name).filter(Boolean).sort();
            }

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
            console.error("No se pudieron sincronizar categorías:", e); 
        }
    },

    populateSelects() {
        const brandSel = document.getElementById('mob-brand');
        if (brandSel) {
            brandSel.innerHTML = '<option value="">-- Seleccionar --</option>' + 
                state.brands.map(b => `<option value="${b}">${b}</option>`).join('');
        }

        const catSel = document.getElementById('mob-cat');
        if (catSel) {
            catSel.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        const statusSel = document.getElementById('mob-status');
        if (statusSel) {
            statusSel.innerHTML = state.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
        }
    },

    async refreshInventory() {
        const listContainer = document.getElementById('mob-inventory-list');
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div><p>Sincronizando...</p></div>';
        
        try {
            state.equipments = await api.getAll('Assets');
            this.renderList();
        } catch (e) {
            const is404 = e.message.includes('404') || e.message.includes('NOT_FOUND');
            listContainer.innerHTML = `
                <div class="loader-container">
                    <p style="font-weight:bold; color:#1e293b">Error de Conexión</p>
                    <p style="font-size:0.75rem; color:#ef4444; margin: 10px 0;">
                        ${is404 ? 'No se encuentra la Base de Datos o la tabla Assets. Verifica que el Base ID sea correcto (debe empezar con app...).' : e.message}
                    </p>
                    <button onclick="ui.showConfigModal()" class="btn btn-primary-mobile" style="background:#3b5da3; margin-top:10px">REVISAR CONFIGURACIÓN</button>
                    <p style="font-size:0.6rem; margin-top:15px; opacity:0.7">Tip: Copia el Base ID directamente desde la URL de tu navegador en PC.</p>
                </div>`;
        }
    },

    renderList() {
        const listContainer = document.getElementById('mob-inventory-list');
        const countLabel = document.getElementById('items-count');
        if (!listContainer) return;

        const filtered = state.equipments.filter(e => {
            const search = (state.searchQuery || '').toLowerCase();
            return (e.fields.ID || '').toLowerCase().includes(search) ||
                   (e.fields.Marca || '').toLowerCase().includes(search) ||
                   (e.fields.Modelo || '').toLowerCase().includes(search) ||
                   (e.fields['Número de Serie'] || '').toLowerCase().includes(search);
        });

        filtered.sort((a, b) => {
            const idA = parseInt((a.fields.ID || '').replace('MAL', '')) || 0;
            const idB = parseInt((b.fields.ID || '').replace('MAL', '')) || 0;
            return idB - idA;
        });

        if (countLabel) countLabel.innerText = `${filtered.length} EQUIPOS ENCONTRADOS`;

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
                            <i class="fas fa-barcode"></i> ${(e.fields['Número de Serie'] || 'S/N').slice(0,20)}
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
        const toggleBtn = document.getElementById('toggle-form');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const content = document.getElementById('asset-form-container');
                content.classList.toggle('hidden');
                toggleBtn.classList.toggle('open');
                if (!content.classList.contains('hidden') && !state.currentEditId) {
                    document.getElementById('mob-id').value = this.generateNextMalId();
                }
            };
        }

        const form = document.getElementById('mobile-asset-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                await this.saveAsset();
            };
        }

        const cancelBtn = document.getElementById('mob-btn-cancel');
        if (cancelBtn) cancelBtn.onclick = () => this.resetForm();

        const imgInput = document.getElementById('mob-img');
        if (imgInput) {
            imgInput.oninput = () => {
                const url = this.formatImageUrl(imgInput.value);
                const preview = document.getElementById('mob-preview-box');
                if (url) {
                    preview.innerHTML = `<img src="${url}" onerror="this.src='';">`;
                } else {
                    preview.innerHTML = `<i class="fas fa-camera"></i><p>Pega un enlace</p>`;
                }
            };
        }

        const searchInp = document.getElementById('mob-search');
        if (searchInp) {
            searchInp.oninput = (e) => {
                state.searchQuery = e.target.value;
                this.renderList();
            };
        }

        if (document.getElementById('btn-refresh')) document.getElementById('btn-refresh').onclick = () => this.refreshInventory();
        if (document.getElementById('btn-config')) document.getElementById('btn-config').onclick = () => this.showConfigModal();
        if (document.getElementById('close-mob-modal')) document.getElementById('close-mob-modal').onclick = () => this.closeModal();
    },

    async saveAsset() {
        const btn = document.getElementById('mob-btn-save');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';

        try {
            const fields = {
                'Marca': document.getElementById('mob-brand').value,
                'Modelo': 'Genérico', 
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
                this.showToast('✅ Actualizado');
            } else {
                fields['ID'] = this.generateNextMalId();
                await api.create('Assets', fields);
                this.showToast('✅ Registrado');
            }

            this.resetForm();
            await this.refreshInventory();
            document.getElementById('asset-form-container').classList.add('hidden');
            document.getElementById('toggle-form').classList.remove('open');
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
        
        document.getElementById('asset-form-container').classList.remove('hidden');
        document.getElementById('toggle-form').classList.add('open');

        document.getElementById('mob-id').value = asset.fields.ID || '';
        document.getElementById('mob-brand').value = asset.fields.Marca || '';
        document.getElementById('mob-sn').value = asset.fields['Número de Serie'] || '';
        document.getElementById('mob-cat').value = asset.fields.Categoría || '';
        document.getElementById('mob-status').value = asset.fields.Estado || '';
        document.getElementById('mob-purchase').value = asset.fields['Fecha de Compra'] || '';
        document.getElementById('mob-desc').value = asset.fields.Descripción || '';
        const img = asset.fields.Foto?.[0]?.url || '';
        document.getElementById('mob-img').value = img;
        
        const preview = document.getElementById('mob-preview-box');
        preview.innerHTML = img ? `<img src="${img}">` : `<i class="fas fa-camera"></i>`;

        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-check"></i> ACTUALIZAR ITEM';
        document.getElementById('mob-btn-cancel').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteAsset(id) {
        if (!confirm('¿Eliminar equipo?')) return;
        try {
            await api.delete('Assets', id);
            this.showToast('🗑️ Eliminado');
            await this.refreshInventory();
        } catch (e) {}
    },

    resetForm() {
        state.currentEditId = null;
        document.getElementById('mobile-asset-form').reset();
        document.getElementById('mob-preview-box').innerHTML = `<i class="fas fa-camera"></i>`;
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-save"></i> GUARDAR REGISTRO';
        document.getElementById('mob-btn-cancel').classList.add('hidden');
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
        if (url.includes('dropbox.com')) return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
        return url;
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('mob-toast');
        if (!toast) return;
        toast.innerText = msg;
        toast.style.background = type === 'error' ? '#ef4444' : '#1e293b';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    },

    showConfigModal() {
        const modal = document.getElementById('mob-modal-overlay');
        const body = document.getElementById('mob-modal-body');
        document.getElementById('mob-modal-title').innerText = "Conexión Airtable";
        body.innerHTML = `
            <div class="field-group">
                <label>Base ID (ej: appXXXXXXXXXXXXXX)</label>
                <input type="text" id="config-base" value="${state.config.baseId}" placeholder="Copia el app... de la URL">
            </div>
            <div class="field-group">
                <label>Personal Access Token (ej: pat...)</label>
                <div style="position:relative">
                    <input type="password" id="config-key" value="${state.config.apiKey}" placeholder="Copia el pat... de Airtable">
                    <button type="button" onclick="const p = document.getElementById('config-key'); p.type = p.type === 'password' ? 'text' : 'password';" 
                            style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:#3b5da3; font-size:1.2rem">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <button id="save-config" class="btn btn-primary-mobile">GUARDAR Y CONECTAR</button>
        `;
        modal.classList.remove('hidden');
        document.getElementById('save-config').onclick = () => {
            const bid = document.getElementById('config-base').value.trim();
            const key = document.getElementById('config-key').value.trim();
            if(!bid || !key) return alert('Datos necesarios');
            localStorage.setItem('airtable_base_id', bid);
            localStorage.setItem('airtable_api_key', key);
            location.reload(); 
        };
    },

    closeModal() {
        document.getElementById('mob-modal-overlay').classList.add('hidden');
    },

    previewImage(url) {
        if(url) window.open(url, '_blank');
    }
};

// Auto-Init
document.addEventListener('DOMContentLoaded', () => ui.init());
