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
    async getTables() { return await this.request('/tables', 'GET', null, true); },
    // Nueva función para subir archivos binarios directamente
    async uploadAttachment(recordId, fieldName, fileData) {
        const cleanBaseId = state.config.baseId.trim().replace(/\s/g, '');
        const cleanApiKey = state.config.apiKey.trim().replace(/\s/g, '');
        const url = `https://content.airtable.com/v0/${cleanBaseId}/${recordId}/${fieldName}/uploadAttachment`;
        const headers = { 
            'Authorization': `Bearer ${cleanApiKey}`, 
            'Content-Type': 'application/json' 
        };
        const response = await fetch(url, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify(fileData) 
        });
        if (!response.ok) throw new Error('Error al subir imagen');
        return await response.json();
    }
};

const ui = {
    // ... rest of ui object
    tempFileData: null, // Para guardar info del archivo capturado
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

        // Use state.categories for the form select
        const catSel = document.getElementById('mob-cat');
        if (catSel) {
            catSel.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // Dynamically populate filter category select from existing equipments
        const filterCatSelect = document.getElementById('mob-filter-cat');
        if (filterCatSelect) {
            const uniqueCategories = [...new Set(state.equipments.map(a => a.fields['Categoría']).filter(Boolean))].sort();
            filterCatSelect.innerHTML = '<option value="">-- Todas las Categorías --</option>' + 
                uniqueCategories.map(c => `<option value="${c}">${c}</option>`).join('');
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
            this.populateSelects(); // Re-populate selects to update filter categories
            this.renderList();
        } catch (e) {
            const is404 = e.message.includes('404') || e.message.includes('NOT_FOUND');
            listContainer.innerHTML = `
                <div class="loader-container">
                    <p style="font-weight:bold; color:#1e293b">Error de Conexión</p>
                    <p style="font-size:0.75rem; color:#ef4444; margin: 10px 0;">
                        ${is404 ? 'No se encuentra la Base de Datos o la tabla Assets. Verifica que el Base ID sea correcto.' : e.message}
                    </p>
                    <button onclick="ui.showConfigModal()" class="btn btn-primary-mobile">REVISAR CONFIGURACIÓN</button>
                </div>`;
        }
    },

    renderList() {
        const listContainer = document.getElementById('mob-inventory-list');
        const itemsCount = document.getElementById('items-count');
        if (!listContainer) return;

        const searchTerm = document.getElementById('mob-search')?.value.toLowerCase() || '';
        const filterCat = document.getElementById('mob-filter-cat')?.value || '';

        const filtered = state.equipments.filter(asset => {
            const fields = asset.fields;
            const matchesSearch = (
                (fields.ID || '').toLowerCase().includes(searchTerm) ||
                (fields.Marca || '').toLowerCase().includes(searchTerm) ||
                (fields.Modelo || '').toLowerCase().includes(searchTerm) ||
                (fields['Número de Serie'] || '').toLowerCase().includes(searchTerm) ||
                (fields.Categoría || '').toLowerCase().includes(searchTerm)
            );
            
            const matchesCategory = filterCat === '' || fields.Categoría === filterCat;
            
            return matchesSearch && matchesCategory;
        });

        filtered.sort((a, b) => {
            const idA = parseInt((a.fields.ID || '').replace('MAL', '')) || 0;
            const idB = parseInt((b.fields.ID || '').replace('MAL', '')) || 0;
            return idB - idA;
        });

        if (itemsCount) itemsCount.innerText = `${filtered.length} EQUIPOS ENCONTRADOS`;

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="loader-container"><p>No se encontraron resultados.</p></div>';
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
                            <div class="card-status-block">
                                <span class="badge ${statusClass}">${status}</span>
                                <span class="card-category-tag">${e.fields.Categoría || '-'}</span>
                            </div>
                        </div>
                        <div class="card-meta">
                            ${(e.fields['Número de Serie'] || 'S/N').slice(0,25)}
                        </div>
                        <div class="card-footer">
                            <div class="card-date">${e.fields['Fecha de Compra'] || '-'}</div>
                            <div class="card-actions">
                                <button class="action-dot action-edit" onclick="ui.editAsset('${e.id}')" title="Editar">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button class="action-dot action-delete" onclick="ui.deleteAsset('${e.id}')" title="Eliminar">
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
                state.searchQuery = e.target.value; // This line is now redundant if renderList uses direct input value
                this.renderList();
            };
        }

        if (document.getElementById('mob-search')) {
            document.getElementById('mob-search').oninput = () => this.renderList();
        }

        if (document.getElementById('mob-filter-cat')) {
            document.getElementById('mob-filter-cat').onchange = () => this.renderList();
        }

        if (document.getElementById('btn-refresh')) document.getElementById('btn-refresh').onclick = () => this.refreshInventory();
        if (document.getElementById('btn-config')) document.getElementById('btn-config').onclick = () => this.showConfigModal();
        if (document.getElementById('close-mob-modal')) document.getElementById('close-mob-modal').onclick = () => this.closeModal();

        // Lógica de archivos desde dispositivo
        const fileInput = document.getElementById('mob-file-input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('mob-preview-box');
                    preview.innerHTML = `<img src="${event.target.result}" style="width:100%; height:100%; object-fit:contain">`;
                    
                    // Extraer solo la parte base64 (sin el prefijo 'data:image/jpeg;base64,')
                    const base64Data = event.target.result.split(',')[1];
                    
                    this.tempFileData = {
                        contentType: file.type,
                        file: base64Data,
                        filename: `foto_${Date.now()}.${file.name.split('.').pop()}`
                    };
                    
                    this.showToast('📸 Foto capturada');
                };
                reader.readAsDataURL(file);
            };
        }
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
            else fields['Foto'] = null; // Limpiar foto si se borra la URL

            let recordId = state.currentEditId;
            if (recordId) {
                await api.update('Assets', recordId, fields);
                this.showToast('✅ Registro Actualizado');
            } else {
                fields['ID'] = this.generateNextMalId();
                const newRecord = await api.create('Assets', fields);
                recordId = newRecord.id;
                this.showToast('✅ Registro Guardado');
            }

            // --- NUEVA SUBIDA DIRECTA DE IMAGEN ---
            if (this.tempFileData && recordId) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBIENDO IMAGEN...';
                await api.uploadAttachment(recordId, 'Foto', this.tempFileData);
                this.tempFileData = null; // Limpiar después de subir
            }

            this.resetForm();
            await this.refreshInventory();
        } catch (e) {
            this.showToast('❌ Error al guardar', 'error');
            console.error(e);
        } finally {
            btn.disabled = false;
            btn.innerHTML = state.currentEditId ? '<i class="fas fa-check"></i> ACTUALIZAR ITEM' : '<i class="fas fa-save"></i> GUARDAR REGISTRO';
        }
    },

    editAsset(id) {
        const asset = state.equipments.find(e => e.id === id);
        if (!asset) return;
        state.currentEditId = id;
        
        // Abrir formulario
        document.getElementById('asset-form-container').classList.remove('hidden');
        document.getElementById('toggle-form').classList.add('open');

        // Llenar campos
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
        preview.innerHTML = img ? `<img src="${img}">` : `<i class="fas fa-camera"></i><p>Pega un enlace abajo</p>`;

        // UI Feedback
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-check"></i> ACTUALIZAR ITEM';
        document.getElementById('mob-btn-cancel').classList.remove('hidden');
        
        // Scroll al formulario
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteAsset(id) {
        if (!confirm('¿Estás seguro de que deseas eliminar este registro?')) return;
        try {
            await api.delete('Assets', id);
            this.showToast('🗑️ Registro Eliminado');
            
            // Si estábamos editando este mismo equipo, resetear formulario
            if (state.currentEditId === id) this.resetForm();
            
            await this.refreshInventory();
        } catch (e) {
            this.showToast('❌ Error al eliminar', 'error');
            console.error(e);
        }
    },

    resetForm() {
        state.currentEditId = null;
        this.tempFileData = null; // Limpiar binario
        document.getElementById('mobile-asset-form').reset();
        document.getElementById('mob-preview-box').innerHTML = `<i class="fas fa-camera"></i><p>Pega un enlace abajo</p>`;
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-save"></i> GUARDAR REGISTRO';
        document.getElementById('mob-btn-cancel').classList.add('hidden');
        document.getElementById('mob-id').value = this.generateNextMalId();

        // Regresar al estado inicial: Cerrar el panel del formulario
        const container = document.getElementById('asset-form-container');
        const toggle = document.getElementById('toggle-form');
        if (container) container.classList.add('hidden');
        if (toggle) toggle.classList.remove('open');
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
                            style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#3b5da3; font-size:1.2rem; cursor:pointer">
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

window.ui = ui; // Exponer ui globalmente para manejar los onclick del HTML

// Auto-Init
document.addEventListener('DOMContentLoaded', () => ui.init());
