/**
 * MalInventario - Smart Multi-Table Synchronizer
 * V8: ULTRA-ROBUST URL Converter & Cache Buster
 */

const APP_VERSION = "1.8.0";

const state = {
    config: {
        baseId: localStorage.getItem('airtable_base_id') || '',
        apiKey: localStorage.getItem('airtable_api_key') || ''
    },
    equipments: [],
    employees: [],
    brands: [],
    categories: [],
    statuses: ['Disponible', 'Asignado', 'En Reparación'],
    assignments: [],
    sort: { field: 'ID', order: 'asc' },
    currentView: 'dashboard'
};

const api = {
    async request(path, method = 'GET', data = null, isMeta = false) {
        if (!state.config.baseId || !state.config.apiKey) { ui.showConfig(); throw new Error('Falta Configuración'); }
        
        // --- LIMPIEZA INTELIGENTE DE CREDENCIALES ---
        let cleanBaseId = state.config.baseId.trim().replace(/\s/g, '');
        if (cleanBaseId.includes('airtable.com/')) {
            const match = cleanBaseId.match(/app[a-zA-Z0-9]{14,}/);
            if (match) cleanBaseId = match[0];
        }

        const cleanApiKey = state.config.apiKey.replace(/Bearer\s+/i, '').trim().replace(/\s/g, '');

        const baseUrl = isMeta ? 'https://api.airtable.com/v0/meta/bases' : 'https://api.airtable.com/v0';
        const url = `${baseUrl}/${cleanBaseId}${path}`;
        const headers = { 
            'Authorization': `Bearer ${cleanApiKey}`, 
            'Content-Type': 'application/json' 
        };
        try {
            ui.setLoading(true);
            const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : null });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error?.message || `Error ${response.status}`);
            return result;
        } finally { ui.setLoading(false); }
    },
    async getAll(table) { return (await this.request(`/${table}`)).records || []; },
    async create(table, fields) { return await this.request(`/${table}`, 'POST', { fields }); },
    async update(table, id, fields) { return await this.request(`/${table}/${id}`, 'PATCH', { fields }); },
    async delete(table, id) { return await this.request(`/${table}/${id}`, 'DELETE'); },
    async addField(tableId, fieldConfig) { return await this.request(`/tables/${tableId}/fields`, 'POST', fieldConfig, true); },
    async getTables() { return await this.request('/tables', 'GET', null, true); },
    async createTable(data) { return await this.request('/tables', 'POST', data, true); }
};

const ui = {
    init() {
        console.log(`MalInventario Init - Version ${APP_VERSION}`);
        this.bindEvents();
        if (!state.config.baseId) this.showConfig();
        else {
            this.refreshMetadata(); // Carga inicial
            this.renderView('inventory');
        }
    },

    async refreshMetadata() {
        try {
            const meta = await api.getTables();
            const assetTable = meta.tables.find(t => t.name === 'Assets');
            
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
        } catch (e) { console.error("Error actualizando metadatos:", e); }
    },

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => { 
            item.onclick = (e) => {
                this.renderView(e.currentTarget.dataset.view);
                // Cerrar sidebar al hacer click en móvil
                document.getElementById('sidebar').classList.remove('open');
            }; 
        });

        // Toggle Sidebar en móvil
        const toggleBtn = document.getElementById('toggle-sidebar');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                document.getElementById('sidebar').classList.toggle('open');
            };
        }

        document.getElementById('config-form').onsubmit = (e) => {
            e.preventDefault();
            this.processAndSave(document.getElementById('base-id').value, document.getElementById('api-key').value);
        };

        // Cerrar Modales
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.onclick = () => this.closeModal();
        });
        window.onclick = (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeModal();
        };
    },

    openModal(title, html) {
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        if (titleEl) titleEl.innerText = title;
        if (bodyEl) bodyEl.innerHTML = html;
        document.getElementById('modal-container').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-container').classList.add('hidden');
    },

    processAndSave(bid, key) {
        let cleanBid = bid.trim();
        if (cleanBid.includes('airtable.com/')) {
            const match = cleanBid.match(/app[a-zA-Z0-9]{14,}/);
            if (match) cleanBid = match[0];
        }

        state.config.baseId = cleanBid;
        state.config.apiKey = key.replace(/Bearer\s+/i, '').trim();
        
        localStorage.setItem('airtable_base_id', state.config.baseId);
        localStorage.setItem('airtable_api_key', state.config.apiKey);
        location.reload(true); // Force reload
    },

    async renderView(view) {
        state.currentView = view;
        const container = document.getElementById('content-area');
        document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
        container.innerHTML = '<div class="spinner"></div>';
        
        // Actualizar Título Dinámico
        const titleText = document.getElementById('page-title-text');
        const titleIcon = document.getElementById('page-title-icon');
        const titles = {
            'inventory': { t: 'Registro de Inventario', i: 'fa-boxes-stacked' },
            'employees': { t: 'Gestión de Empleados', i: 'fa-users' },
            'assignments': { t: 'Control de Asignaciones', i: 'fa-clipboard-list' },
            'brands': { t: 'Catálogo de Marcas', i: 'fa-tags' },
            'config': { t: 'Configuración del Sistema', i: 'fa-cog' },
            'dashboard': { t: 'Panel de Control', i: 'fa-th-large' }
        };

        if (titles[view]) {
            titleText.innerText = titles[view].t;
            titleIcon.className = `fas ${titles[view].i} header-icon`;
        }

        // Asegurar metadatos actualizados antes de renderizar cualquier vista
        await this.refreshMetadata();

        try {
            if (view === 'inventory') await this.viewInventory(container);
            if (view === 'employees') await this.viewEmployees(container);
            if (view === 'assignments') await this.viewAssignments(container);
            if (view === 'brands') await this.viewBrands(container);
            if (view === 'config') this.viewConfig(container);
            if (view === 'dashboard') await this.viewDashboard(container);
        } catch (err) { container.innerHTML = `<div style="padding:2rem"><h2>Error</h2><p>${err.message}</p></div>`; }
    },

    // Convierte enlaces de Drive/Dropbox a enlaces directos de imagen
    formatImageUrl(url) {
        if (!url) return '';
        url = url.trim();
        // Google Drive - Múltiples formatos (file/d/, id=, open?id=)
        if (url.includes('drive.google.com')) {
            const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || 
                       url.match(/id=([a-zA-Z0-9_-]+)/)?.[1] || 
                       url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
                       url.match(/\/uc\?id=([a-zA-Z0-9_-]+)/)?.[1];
            if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
        }
        // Dropbox
        if (url.includes('dropbox.com')) {
            return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('&dl=0', '');
        }
        return url;
    },
    renderTableRows(data) {
        return data.map(e => {
            const img = e.fields.Foto?.[0]?.url || '';
            const date = e.fields['Fecha de Compra'] || '-';
            return `<tr>
                <td>
                    <div style="width:55px; height:55px; border-radius:10px; overflow:hidden; background:#f1f5f9; display:flex; align-items:center; justify-content:center; border:1px solid #e2e8f0">
                        ${img ? `<img src="${img}" style="width:100%; height:100%; object-fit:cover">` : `<i class="fas fa-image" style="color:#cbd5e1"></i>`}
                    </div>
                </td>
                <td><strong>${e.fields.ID || '-'}</strong></td>
                <td>${e.fields.Marca || ''} ${e.fields.Modelo || ''}</td>
                <td style="font-size:0.8rem">${date}</td>
                <td><span class="badge badge-${(e.fields.Estado || 'disp').slice(0,4).toLowerCase()}">${e.fields.Estado}</span></td>
                <td class="actions-cell">
                    <button class="btn-action btn-edit" onclick="ui.editAsset('${e.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-action btn-delete" onclick="ui.deleteAsset('${e.id}')" title="Borrar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    },

    getSortIcon(field) {
        if (state.sort.field !== field) return '<i class="fas fa-sort" style="opacity:0.3; margin-left:5px"></i>';
        return state.sort.order === 'asc' ? '<i class="fas fa-sort-up" style="margin-left:5px"></i>' : '<i class="fas fa-sort-down" style="margin-left:5px"></i>';
    },

    handleSort(field) {
        if (state.sort.field === field) {
            state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
        } else {
            state.sort.field = field;
            state.sort.order = 'asc';
        }
        this.renderView('inventory');
    },


    renderEmployeeRows(data) {
        return data.map(e => {
            const img = e.fields.Foto?.[0]?.url || '';
            const preview = img ? `<img src="${img}" class="img-mini">` : `<div class="img-mini-placeholder"><i class="fas fa-user"></i></div>`;
            return `
                <tr>
                    <td>${preview}</td>
                    <td><strong>${e.fields['Nombre Completo'] || '-'}</strong></td>
                    <td>${e.fields.Cargo || '-'}</td>
                    <td>${e.fields.Departamento || '-'}</td>
                    <td>${e.fields['Correo Electrónico'] || e.fields.Email || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-action btn-edit" onclick="ui.editEmployee('${e.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-delete" onclick="ui.deleteEmployee('${e.id}')" title="Borrar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        }).join('');
    },

    async viewInventory(container) {
        state.equipments = await api.getAll('Assets');
        state.brands = await api.getAll('Marcas');
        
        container.innerHTML = `
            <div class="form-container-styled">
                <form id="main-asset-form" style="display:contents">
                    <!-- FOTO: Agrupada a la izquierda -->
                    <div class="field-group" style="grid-column: 1; grid-row: 1 / span 2; text-align:center; padding-right: 10px; border-right: 1px solid #e2e8f0;">
                        <div class="img-preview-container" id="img-preview-box" style="height:90px !important; width:100%; border:2px dashed #cbd5e1; border-radius:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#fff">
                            <i class="fas fa-camera" style="font-size: 1.5rem; color: #cbd5e1"></i>
                        </div>
                    </div>

                    <!-- FILA 1: Datos principales lineales -->
                    <div class="field-group" style="grid-column: 2;"><label>ID MAL</label><input type="text" id="f-id" readonly style="background:#f1f5f9; font-weight:bold"></div>
                    <div class="field-group" style="grid-column: 3;"><label>Marca</label>
                        <select id="f-brand">
                            <option value="">-- Seleccionar --</option>
                            ${state.brands.map(b => `<option value="${b.fields.Nombre||b.fields.Name}">${b.fields.Nombre||b.fields.Name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" style="grid-column: 4;"><label>Nº de Serie</label><input type="text" id="f-sn"></div>
                    <div class="field-group" style="grid-column: 5;"><label>Categoría</label>
                        <select id="f-cat">
                            ${state.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" style="grid-column: 6;"><label>Fecha de Compra</label><input type="date" id="f-purchase"></div>

                    <!-- FILA 2: URL, Descripción y Botón -->
                    <div class="field-group" style="grid-column: 2 / span 2; position: relative;">
                        <label>Enlace Foto (Opcional)</label>
                        <input type="text" id="f-img" placeholder="Pegue el enlace aquí..." style="width:100%; height:30px !important; font-size:0.75rem !important; border:1px solid #3b5da3; background:#fff">
                        <span id="url-status" style="display: block; font-size:0.6rem; color:#64748b; font-weight:600; margin-top: 2px;">Soporta Drive / Dropbox</span>
                    </div>

                    <div class="field-group" style="grid-column: 4 / span 2;">
                        <label>Descripción / Especificaciones</label>
                        <input type="text" id="f-desc" placeholder="Detalles técnicos (ej. i5, 16GB RAM...)" style="width:100%; height:30px !important; font-size:0.75rem !important; border:1px solid #3b5da3; background:#fff">
                        <div style="height: 12px;"></div> <!-- Espaciador para alinear con el estado de la URL -->
                    </div>
                    
                    <div class="field-group" style="grid-column: 6; display: flex; align-items: end; padding-bottom: 14px;">
                        <button type="submit" class="btn btn-primary" id="btn-save" style="width:100%; height:32px !important; font-weight:bold; font-size:0.7rem !important;">GUARDAR DATOS</button>
                    </div>

                    <!-- Ocultos -->
                    <input type="hidden" id="f-model" value="Genérico">
                    <input type="hidden" id="f-status" value="Disponible">
                </form>
            </div>

            <!-- BARRA DE FILTROS -->
            <div class="filter-bar">
                <div class="filter-label">🔍 BUSCAR EQUIPO:</div>
                <div class="filter-inputs">
                    <input type="text" id="filter-id" placeholder="Filtrar por ID..." style="flex: 0.5; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                    <select id="filter-brand" style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                        <option value="">-- Todas las Marcas --</option>
                        ${[...new Set(state.equipments.map(e => e.fields.Marca).filter(Boolean))].map(b => `<option value="${b}">${b}</option>`).join('')}
                    </select>
                    <select id="filter-cat" style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                        <option value="">-- Todas las Categorías --</option>
                        ${state.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <select id="filter-status" style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                        <option value="">-- Todos los Estados --</option>
                        ${state.statuses.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <!-- TABLA CON SCROLL AUTOMATICO (Contenedor Dinámico) -->
            <div class="table-container-scroll" style="height: calc(100vh - 280px) !important; min-height: 400px; overflow-y: auto !important; border: 2px solid #3b5da3; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white;">
                <table class="table-styled" style="border-collapse: separate;">
                    <thead>
                        <tr><th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Miniatura</th>
                            <th onclick="ui.handleSort('ID')" style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; cursor:pointer">ID ${this.getSortIcon('ID')}</th>
                            <th onclick="ui.handleSort('Marca')" style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; cursor:pointer">Marca / Modelo ${this.getSortIcon('Marca')}</th>
                            <th onclick="ui.handleSort('Fecha de Compra')" style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; cursor:pointer">Compra ${this.getSortIcon('Fecha de Compra')}</th>
                            <th onclick="ui.handleSort('Estado')" style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; cursor:pointer">Estado ${this.getSortIcon('Estado')}</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; text-align:right">Acciones</th></tr>
                    </thead>
                    <tbody id="inventory-tbody">${this.renderTableRows(state.equipments)}</tbody>
                </table>
            </div>
        `;

        // Lógica de Previsualización Instantánea
        const imgInput = document.getElementById('f-img');
        const handleUrlChange = () => {
            const rawUrl = imgInput.value.trim();
            const cleanUrl = this.formatImageUrl(rawUrl);
            const previewBox = document.getElementById('img-preview-box');
            const status = document.getElementById('url-status'); // Puede ser null

            if (cleanUrl) {
                previewBox.innerHTML = `<img src="${cleanUrl}" style="width:100%; height:100%; object-fit:contain" 
                    onload="if(document.getElementById('url-status')){ document.getElementById('url-status').innerText='✓ Imagen Lista'; document.getElementById('url-status').style.color='#10b981'; }"
                    onerror="this.src=''; if(document.getElementById('url-status')){ document.getElementById('url-status').innerText='✕ Error de Acceso (Verifique Permisos en Drive)'; document.getElementById('url-status').style.color='#ef4444'; }">`;
                if (status) {
                    status.innerText = "Verificando acceso a la imagen...";
                    status.style.color = "#3b5da3";
                }
            } else {
                previewBox.innerHTML = `<i class="fas fa-camera" style="font-size:1.5rem;color:#cbd5e1"></i>`;
                if (status) {
                    status.innerText = "Soporta enlaces de Google Drive y Dropbox.";
                    status.style.color = "#64748b";
                }
            }
        };

        imgInput.oninput = handleUrlChange;
        imgInput.onpaste = () => setTimeout(handleUrlChange, 100);

        // Lógica de Filtros
        const filterId = document.getElementById('filter-id');
        const filterBrand = document.getElementById('filter-brand');
        const filterCat = document.getElementById('filter-cat');
        const filterStatus = document.getElementById('filter-status');
        const tbody = document.getElementById('inventory-tbody');

        const applyFilters = () => {
            const idVal = filterId.value.toLowerCase();
            const brandVal = filterBrand.value.toLowerCase();
            const catVal = filterCat.value.toLowerCase();
            const statusVal = filterStatus.value.toLowerCase();

            const filtered = state.equipments.filter(e => {
                const matchId = (e.fields.ID || '').toLowerCase().includes(idVal);
                const matchBrand = !brandVal || (e.fields.Marca || '').toLowerCase() === brandVal;
                const matchCat = !catVal || (e.fields.Categoría || '').toLowerCase() === catVal;
                const matchStatus = !statusVal || (e.fields.Estado || '').toLowerCase() === statusVal;
                return matchId && matchBrand && matchCat && matchStatus;
            });

            // Aplicar Ordenamiento
            filtered.sort((a, b) => {
                let valA = (a.fields[state.sort.field] || '').toString().toLowerCase();
                let valB = (b.fields[state.sort.field] || '').toString().toLowerCase();
                
                if (state.sort.field === 'ID') {
                    valA = parseInt((a.fields.ID || '').toString().replace(/MAL/i, '')) || 0;
                    valB = parseInt((b.fields.ID || '').toString().replace(/MAL/i, '')) || 0;
                }

                if (valA < valB) return state.sort.order === 'asc' ? -1 : 1;
                if (valA > valB) return state.sort.order === 'asc' ? 1 : -1;
                return 0;
            });

            tbody.innerHTML = this.renderTableRows(filtered);
        };

        applyFilters(); // Initial render with filters/sort


        filterId.oninput = applyFilters;
        filterBrand.onchange = applyFilters;
        filterCat.onchange = applyFilters;
        filterStatus.onchange = applyFilters;

        // Guardado
        document.getElementById('main-asset-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save');
            const url = this.formatImageUrl(imgInput.value.trim());
            btn.disabled = true; btn.innerText = 'GUARDANDO EN AIRTABLE...';
            
            try {
                const editId = document.getElementById('main-asset-form').dataset.editId;
                const fields = {
                    'Marca': document.getElementById('f-brand').value,
                    'Modelo': document.getElementById('f-model').value,
                    'Categoría': document.getElementById('f-cat').value,
                    'Número de Serie': document.getElementById('f-sn').value,
                    'Estado': document.getElementById('f-status').value,
                    'Descripción': document.getElementById('f-desc').value,
                    'Fecha de Compra': document.getElementById('f-purchase').value || null,
                    'Nombre': `${document.getElementById('f-brand').value} ${document.getElementById('f-model').value}`
                };

                if (url && (url.startsWith('http'))) {
                    fields['Foto'] = [{ url: url }];
                } else if (editId) {
                    fields['Foto'] = []; // Vaciar en Airtable en caso de update
                }

                if (editId) {
                    await api.update('Assets', editId, fields);
                    this.notify('¡Equipo actualizado!');
                    await this.renderView('inventory');
                    fields['ID'] = this.generateNextMalId();
                    await api.create('Assets', fields);
                    this.notify('¡Equipo registrado!');
                    
                    // Cierre y refresco directo de la vista de Inventario (sin confirmación)
                    await this.renderView('inventory');
                    setTimeout(() => {
                        document.querySelector('.table-container-scroll')?.scrollIntoView({ behavior: 'smooth' });
                    }, 500);
                }
            } catch (err) { alert('ERROR: ' + err.message); } finally { btn.disabled = false; btn.innerText = 'GUARDAR DATOS'; }
        };
    },

    generateNextMalId() {
        const ids = state.equipments.map(e => parseInt((e.fields.ID || '').replace('MAL', '')) || 0);
        return `MAL${(Math.max(...ids, 0) + 1).toString().padStart(3, '0')}`;
    },

    editAsset(id) {
        const asset = state.equipments.find(e => e.id === id);
        const img = asset.fields.Foto?.[0]?.url || '';
        document.getElementById('f-id').value = asset.fields.ID || '';
        document.getElementById('f-brand').value = asset.fields.Marca || '';
        document.getElementById('f-model').value = asset.fields.Modelo || '';
        document.getElementById('f-cat').value = asset.fields.Categoría || 'Laptop';
        document.getElementById('f-sn').value = asset.fields['Número de Serie'] || '';
        document.getElementById('f-status').value = asset.fields.Estado || 'Disponible';
        document.getElementById('f-purchase').value = asset.fields['Fecha de Compra'] || '';
        document.getElementById('f-img').value = img;
        document.getElementById('f-desc').value = asset.fields.Descripción || '';
        
        const preview = document.getElementById('img-preview-box');
        preview.innerHTML = img ? `<img src="${img}" style="width:100%; height:100%; object-fit:contain">` : `<i class="fas fa-camera" style="font-size:2.5rem;color:#cbd5e1"></i>`;
        
        document.getElementById('main-asset-form').dataset.editId = id;
        document.getElementById('btn-save').innerText = 'ACTUALIZAR DATOS';
        document.getElementById('main-asset-form').scrollIntoView({ behavior: 'smooth' });
    },

    async deleteAsset(id) { if(confirm('¿Eliminar registro?')) { await api.delete('Assets', id); this.renderView('inventory'); } },

    // OTRAS VISTAS (Personal, Marcas)
    // --- VISTA EMPLEADOS (ESTILO PREMIUM) ---
    async viewEmployees(container) {
        const [data, meta] = await Promise.all([api.getAll('Empleados'), api.getTables()]);
        state.employees = data;
        
        const tableMeta = meta.tables.find(t => t.name === 'Empleados');
        const fields = tableMeta?.fields || [];
        
        // Campos principales para el formulario linear (Filtrados)
        const mainFields = fields.filter(f => !['ID', 'Foto', 'Asignaciones'].includes(f.name) && f.type !== 'multipleLookupValues');

        container.innerHTML = `
            <div class="form-container-styled">
                <form id="employee-form" style="display:contents">
                    <!-- FOTO -->
                    <div class="field-group" style="grid-column: 1; grid-row: 1 / span 2; text-align:center; padding-right: 10px; border-right: 1px solid #e2e8f0;">
                        <div class="img-preview-container" id="emp-preview-box" style="height:90px !important; width:100%; border:2px dashed #cbd5e1; border-radius:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#fff">
                            <i class="fas fa-user" style="font-size: 1.5rem; color: #cbd5e1"></i>
                        </div>
                    </div>

                    <!-- FORMULARIO DINAMICO LINEAL -->
                    <div style="grid-column: 2 / span 5; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                        ${mainFields.map(f => {
                            const isSelect = f.options?.choices;
                            return `
                            <div class="field-group">
                                <label>${f.name}</label>
                                ${isSelect ? `
                                    <select id="ef-${f.name}" style="width:100%; height:26px; font-size:0.75rem">
                                        <option value="">-- Seleccionar --</option>
                                        ${f.options.choices.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                    </select>
                                ` : `<input type="text" id="ef-${f.name}" placeholder="${f.name}...">`}
                            </div>`;
                        }).join('')}
                    </div>

                    <!-- URL Y BOTON -->
                    <div class="field-group" style="grid-column: 2 / span 4;">
                        <input type="text" id="ef-img" placeholder="URL de Foto (Drive/Dropbox)..." style="width:100%; height:30px !important; font-size:0.75rem !important; border:1px solid #3b5da3; background:#fff">
                    </div>
                    
                    <div class="field-group" style="grid-column: 6; display: flex; align-items: end;">
                        <button type="submit" class="btn btn-primary" id="btn-save-emp" style="width:100%; height:32px !important; font-weight:bold; font-size:0.7rem !important;">GUARDAR</button>
                    </div>
                </form>
            </div>

            <!-- BÚSQUEDA -->
            <div class="filter-bar">
                <div class="filter-label">🔍 BUSCAR PERSONAL:</div>
                <div class="filter-inputs">
                    <input type="text" id="search-emp" placeholder="Nombre completo, cargo o departamento..." style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                </div>
            </div>
            
            <div class="table-container-scroll" style="height: 380px !important; overflow-y: scroll !important; border: 2px solid #3b5da3; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white;">
                <table class="table-styled" style="border-collapse: separate;">
                    <thead>
                        <tr>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Foto</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Nombre Completo</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Cargo</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Departamento</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Correo Electrónico</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; text-align:right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="emp-tbody">${this.renderEmployeeRows(data)}</tbody>
                </table>
            </div>
        `;

        // Lógica de URL Foto
        const imgInp = document.getElementById('ef-img');
        imgInp.oninput = () => {
            const url = this.formatImageUrl(imgInp.value);
            document.getElementById('emp-preview-box').innerHTML = url ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain">` : `<i class="fas fa-user" style="font-size:1.5rem;color:#cbd5e1"></i>`;
        };

        // Búsqueda
        document.getElementById('search-emp').oninput = (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = state.employees.filter(emp => 
                Object.values(emp.fields).some(v => v.toString().toLowerCase().includes(val))
            );
            document.getElementById('emp-tbody').innerHTML = this.renderEmployeeRows(filtered);
        };

        // Guardar
        document.getElementById('employee-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-emp');
            btn.disabled = true; btn.innerText = 'GUARDANDO...';
            
            const fieldsData = {};
            mainFields.forEach(f => { fieldsData[f.name] = document.getElementById(`ef-${f.name}`).value; });
            const photoUrl = this.formatImageUrl(imgInp.value);
            if (photoUrl) fieldsData['Foto'] = [{ url: photoUrl }];

            const editId = document.getElementById('employee-form').dataset.editId;
            try {
                if (editId) {
                    await api.update('Empleados', editId, fieldsData);
                    this.notify('¡Empleado actualizado!');
                    this.renderView('employees');
                } else {
                    await api.create('Empleados', fieldsData);
                    this.notify('¡Personal Guardado!');
                    this.renderView('employees');
                    setTimeout(() => {
                        document.querySelector('.table-container-scroll')?.scrollIntoView({ behavior: 'smooth' });
                    }, 500);
                }
            } catch (err) { alert(err.message); btn.disabled = false; btn.innerText = 'GUARDAR'; }
        };
    },

    editEmployee(id) {
        const emp = state.employees.find(e => e.id === id);
        const form = document.getElementById('employee-form');
        form.dataset.editId = id;
        
        // Llenar campos dinámicos
        Object.keys(emp.fields).forEach(key => {
            const el = document.getElementById(`ef-${key}`);
            if (el) el.value = emp.fields[key];
        });
        
        const img = emp.fields.Foto?.[0]?.url || '';
        document.getElementById('ef-img').value = img;
        document.getElementById('emp-preview-box').innerHTML = img ? `<img src="${img}" style="width:100%; height:100%; object-fit:contain">` : `<i class="fas fa-user" style="font-size:1.5rem;color:#cbd5e1"></i>`;
        
        document.getElementById('btn-save-emp').innerText = 'ACTUALIZAR';
        form.scrollIntoView({ behavior: 'smooth' });
    },

    async deleteEmployee(id) { if(confirm('¿Eliminar empleado?')) { await api.delete('Empleados', id); this.renderView('employees'); } },

    async viewBrands(container) {
        const data = await api.getAll('Marcas');
        container.innerHTML = `<div class="form-container-styled"><div class="form-title-full">Marcas</div><form id="fb" style="display:contents"><div class="field-group"><label>Nombre</label><input type="text" id="bn" required></div><button class="btn btn-primary" style="margin-top:20px">Guardar</button></form></div><table class="table-styled"><thead><tr><th>Marca</th><th style="text-align:right">Acción</th></tr></thead><tbody>${data.map(b=>`<tr><td>${b.fields.Nombre||'-'}</td><td class="actions-cell"><button class="btn-action btn-delete" onclick="ui.deleteBrand('${b.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table>`;
        document.getElementById('fb').onsubmit = async(e)=>{ e.preventDefault(); await api.create('Marcas', {'Nombre':document.getElementById('bn').value}); this.renderView('brands'); };
    },
    async deleteBrand(id) { await api.delete('Marcas', id); this.renderView('brands'); },

    async viewAssignments(container) {
        const [eqs, emps, ass] = await Promise.all([
            api.getAll('Assets'),
            api.getAll('Empleados'),
            api.getAll('Asignaciones')
        ]);
        
        state.equipments = eqs;
        state.employees = emps;
        state.assignments = ass;

        // Búsqueda más robusta de equipos disponibles (Insensible a mayúsculas/espacios)
        const availableEqs = eqs.filter(e => {
            const status = (e.fields.Estado || '').trim().toLowerCase();
            return status === 'disponible';
        });

        container.innerHTML = `
            <div class="form-container-styled">
                <form id="assignment-form" style="display:contents">
                    <!-- PREVISUALIZACIÓN EQUIPO -->
                    <div class="field-group" style="grid-column: 1; grid-row: 1 / span 2; text-align:center; padding-right: 10px; border-right: 1px solid #e2e8f0;">
                        <div class="img-preview-container" id="asig-preview-box" style="height:90px !important; width:100%; border:2px dashed #cbd5e1; border-radius:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#fff">
                            <i class="fas fa-laptop" style="font-size: 1.5rem; color: #cbd5e1"></i>
                        </div>
                    </div>

                    <!-- SELECCIÓN DE EQUIPO -->
                    <div class="field-group" style="grid-column: 2 / span 2;">
                        <label>Seleccionar Equipo Disponible</label>
                        <select id="asig-eq" required style="width:100%">
                            <option value="">-- Seleccionar Equipo --</option>
                            ${availableEqs.map(e => `<option value="${e.id}" data-img="${e.fields.Foto?.[0]?.url || ''}">${e.fields.ID} - ${e.fields.Marca} ${e.fields.Modelo || ''}</option>`).join('')}
                        </select>
                    </div>

                    <!-- SELECCIÓN DE EMPLEADO -->
                    <div class="field-group" style="grid-column: 4 / span 2;">
                        <label>Asignar a Empleado</label>
                        <select id="asig-emp" required style="width:100%">
                            <option value="">-- Seleccionar Empleado --</option>
                            ${emps.map(e => `<option value="${e.id}">${e.fields['Nombre Completo'] || '-'}</option>`).join('')}
                        </select>
                    </div>

                    <!-- FECHA Y BOTÓN -->
                    <div class="field-group" style="grid-column: 6;">
                        <label>Fecha</label>
                        <input type="date" id="asig-date" value="${new Date().toISOString().split('T')[0]}">
                    </div>

                    <div class="field-group" style="grid-column: 2 / span 4; margin-top: -10px">
                        <span id="asig-info" style="font-size:0.65rem; color:#64748b">Seleccione un equipo para ver su miniatura.</span>
                    </div>

                    <div class="field-group" style="grid-column: 6; display: flex; align-items: end;">
                        <button type="submit" class="btn btn-primary" id="btn-save-asig" style="width:100%; height:32px !important; font-weight:bold; font-size:0.7rem !important;">ASIGNAR EQUIPO</button>
                    </div>
                </form>
            </div>

            <!-- BARRA DE BÚSQUEDA DE ASIGNACIONES -->
            <div class="filter-bar">
                <div class="filter-label">🔍 ASIGNACIONES:</div>
                <div class="filter-inputs">
                    <input type="text" id="search-asig" placeholder="Buscar por ID de equipo o nombre de empleado..." style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem;">
                </div>
            </div>

            <!-- TABLA DE ASIGNACIONES -->
            <div class="table-container-scroll" style="height: 380px !important; overflow-y: scroll !important; border: 2px solid #3b5da3; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white;">
                <table class="table-styled" style="border-collapse: separate;">
                    <thead>
                        <tr>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">ID Equipo</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Equipo</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Empleado</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white;">Fecha</th>
                            <th style="position:sticky; top:0; z-index:100; background:#6b8e23; color:white; text-align:right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="asig-tbody">${this.renderAssignmentRows(ass, eqs, emps)}</tbody>
                </table>
            </div>
        `;

        // Lógica de Previsualización al cambiar equipo
        const eqSelect = document.getElementById('asig-eq');
        eqSelect.onchange = () => {
            const opt = eqSelect.options[eqSelect.selectedIndex];
            const imgUrl = opt.dataset.img;
            const previewBox = document.getElementById('asig-preview-box');
            previewBox.innerHTML = imgUrl ? `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:contain">` : `<i class="fas fa-laptop" style="font-size:1.5rem;color:#cbd5e1"></i>`;
        };

        // Búsqueda
        document.getElementById('search-asig').oninput = (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = ass.filter(a => {
                const eq = eqs.find(x => x.id === a.fields.asset?.[0]);
                const em = emps.find(x => x.id === a.fields.employee?.[0]);
                return (eq?.fields.ID || '').toLowerCase().includes(val) || 
                       (em?.fields['Nombre Completo'] || '').toLowerCase().includes(val);
            });
            document.getElementById('asig-tbody').innerHTML = this.renderAssignmentRows(filtered, eqs, emps);
        };

        // Envío de Formulario
        document.getElementById('assignment-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-asig');
            const assetId = document.getElementById('asig-eq').value;
            const employeeId = document.getElementById('asig-emp').value;
            const date = document.getElementById('asig-date').value;

            if (!assetId || !employeeId) return;

            btn.disabled = true; btn.innerText = 'PROCESANDO...';
            try {
                // Obtener nombres para el ID descriptivo
                const eq = state.equipments.find(x => x.id === assetId);
                const em = state.employees.find(x => x.id === employeeId);
                const descId = `${eq?.fields.ID || 'EQ'}-${em?.fields['Nombre Completo']?.split(' ')[0] || 'EMP'}-${Date.now().toString().slice(-4)}`;

                // 1. Crear asignación
                const asigPayload = {
                    'ID Asignación': descId,
                    'asset': [assetId],
                    'employee': [employeeId],
                    'assignmentDate': date
                };
                
                try {
                    await api.create('Asignaciones', asigPayload);
                } catch (primaryErr) {
                    if (primaryErr.message.includes('belongs to table') && primaryErr.message.includes('links to table')) {
                        console.warn("Airtable schema mismatch detected. Swapping fields...");
                        asigPayload['asset'] = [employeeId];
                        asigPayload['employee'] = [assetId];
                        await api.create('Asignaciones', asigPayload);
                    } else {
                        throw primaryErr;
                    }
                }

                // 2. Actualizar estado del equipo
                await api.update('Assets', assetId, { 'Estado': 'Asignado' });

                this.notify('¡Equipo Asignado!');
                await this.renderView('assignments');
                setTimeout(() => {
                    document.querySelector('.table-container-scroll')?.scrollIntoView({ behavior: 'smooth' });
                }, 500);
            } catch (err) {
                alert('ERROR: ' + err.message);
            } finally {
                btn.disabled = false; btn.innerText = 'ASIGNAR EQUIPO';
            }
        };
    },

    renderAssignmentRows(assignments, eqs, emps) {
        return assignments.map(a => {
            const eq = eqs.find(x => x.id === a.fields.asset?.[0]);
            const em = emps.find(x => x.id === a.fields.employee?.[0]);
            return `
                <tr>
                    <td><strong>${eq?.fields.ID || '-'}</strong></td>
                    <td>${eq?.fields.Marca || ''} ${eq?.fields.Modelo || ''}</td>
                    <td>${em?.fields['Nombre Completo'] || '-'}</td>
                    <td>${a.fields.assignmentDate || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-action btn-delete" onclick="ui.unassign('${a.id}', '${eq?.id}')" title="Reversar Asignación">
                            <i class="fas fa-undo"></i>
                        </button>
                    </td>
                </tr>`;
        }).join('');
    },

    async unassign(id, eqid) {
        const eq = state.equipments.find(x => x.id === eqid);
        
        const modalHtml = `
            <div class="revert-modal-content">
                <p class="modal-instruction-text">
                    Estás por reversar la asignación del equipo <strong>${eq?.fields.ID || 'Equipo'}</strong>. 
                    El registro de asignación será eliminado y el equipo cambiará a su nuevo estado.
                </p>
                <form id="revert-form">
                    <div class="field-group" style="margin-bottom: 25px;">
                        <label>SELECCIONAR NUEVO ESTADO</label>
                        <select id="new-status" required class="premium-select">
                            ${state.statuses.map(s => {
                                const sClean = (s || '').trim().toLowerCase();
                                if (sClean === 'asignado') return ''; // No permitir reasociar aquí
                                
                                let icon = '🔴';
                                if (sClean === 'disponible') icon = '🟢';
                                if (sClean.includes('reparaci') || sClean === 'mantenimiento') icon = '🟡';
                                
                                return `<option value="${s}">${icon} ${s.toUpperCase()}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="modal-actions-layout" style="display: flex; gap: 15px; margin-top: 10px;">
                        <button type="submit" class="btn btn-primary" style="flex: 2; height: 45px !important; font-size: 0.85rem !important; background: var(--navy-blue); color: white; border: none;">REVERSAR ASIGNACIÓN</button>
                        <button type="button" class="btn btn-secondary closeModalBtn" style="flex: 1; height: 45px !important; font-size: 0.85rem !important; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 50px; font-weight: 700; cursor: pointer;">CANCELAR</button>
                    </div>
                </form>
            </div>
        `;

        this.openModal('Reversar Asignación', modalHtml);

        // Bind events del modal
        document.querySelector('.closeModalBtn').onclick = () => this.closeModal();
        
        document.getElementById('revert-form').onsubmit = async (e) => {
            e.preventDefault();
            const newStatus = document.getElementById('new-status').value;
            const btn = e.target.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.innerText = 'ACTUALIZANDO...';

            try {
                ui.setLoading(true);
                // 1. Eliminar la asignación
                await api.delete('Asignaciones', id);
                
                // 2. Actualizar el estado del equipo
                if (eqid) {
                    await api.update('Assets', eqid, { 'Estado': newStatus });
                }

                this.closeModal();
                this.notify('✓ Asignación reversada y estado actualizado.');
                await this.renderView('assignments');
            } catch (err) {
                alert('Error al reversar: ' + err.message);
                btn.disabled = false;
                btn.innerText = 'REVERSAR ASIGNACIÓN';
            } finally {
                ui.setLoading(false);
            }
        };
    },

    async viewDashboard(container) {
        const eqs = await api.getAll('Assets');
        container.innerHTML = `
            <div class="welcome-container" style="text-align: center; padding: 2rem;">
                <img src="assets/logo-maldita.png" alt="Logo Fundación Maldita" style="max-width: 300px; height: auto; margin-bottom: 2rem; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.1));">
                <div class="stat-dashboard">
                    <h3>Equipos en Total</h3>
                    <div class="stat-number">${eqs.length}</div>
                </div>
            </div>
        `;
    },

    viewConfig(container) {
        container.innerHTML = `
            <div class="form-container-styled" style="grid-template-columns: 1fr; gap: 20px;">
                <div class="form-title-full">Configuración de Conexión (v${APP_VERSION})</div>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <h4 style="margin-top:0; color:#1e293b; margin-bottom:15px">Tus credenciales guardadas:</h4>
                    <div class="form-group" style="margin-bottom:15px">
                        <label>Base ID</label>
                        <div style="display:flex; gap:10px">
                            <input type="text" value="${state.config.baseId}" readonly style="background:#fff; flex:1">
                            <button onclick="navigator.clipboard.writeText('${state.config.baseId}'); ui.notify('Copiado al portapapeles')" class="btn btn-secondary" style="padding: 5px 15px; background: #fff; border: 1px solid #cbd5e1; height: auto;"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Personal Access Token</label>
                        <div style="display:flex; gap:10px; position:relative">
                            <input type="password" id="view-api-key" value="${state.config.apiKey}" readonly style="background:#fff; flex:1">
                            <button onclick="const p = document.getElementById('view-api-key'); p.type = p.type === 'password' ? 'text' : 'password';" class="btn btn-secondary" style="padding: 5px 15px; background: #fff; border: 1px solid #cbd5e1; height: auto;"><i class="fas fa-eye"></i></button>
                            <button onclick="navigator.clipboard.writeText('${state.config.apiKey}'); ui.notify('Copiado al portapapeles')" class="btn btn-secondary" style="padding: 5px 15px; background: #fff; border: 1px solid #cbd5e1; height: auto;"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                    <p style="font-size:0.75rem; color:#64748b; margin-top:15px">
                        * Copia estos datos para usarlos en tu versión móvil.
                    </p>
                </div>

                <div style="background: #fdfbe7; padding: 20px; border-radius: 12px; border: 1px solid #fef3c7;">
                    <h4 style="margin-top:0; color:#92400e; margin-bottom:10px">Mantenimiento de Base de Datos</h4>
                    <p style="font-size:0.85rem; color:#b45309">Si has añadido tablas o las fotos no cargan, pulsa el botón para sincronizar la estructura.</p>
                    <button onclick="ui.autoSetup()" class="btn btn-primary" id="btn-sync" style="background:#d97706; margin-top:10px">SINCRONIZAR ESTRUCTURA</button>
                </div>

                <div style="text-align:center">
                    <button onclick="localStorage.clear(); location.reload();" class="btn btn-secondary" style="color:#ef4444; border-color:#fca5a5">CERRAR SESIÓN / LIMPIAR DATOS</button>
                </div>
            </div>
        `;
    },

    async autoSetup() {
        const btn = document.getElementById('btn-sync');
        btn.disabled = true; btn.innerText = 'SINCRONIZANDO...';
        try {
            const current = await api.getTables();
            const tables = current.tables;
            const tableNames = tables.map(t => t.name);

            // 1. Asegurar Tabla Assets
            let assets = tables.find(t => t.name === 'Assets');
            if (!assets) {
                await api.createTable({ name: 'Assets', fields: [
                    { name: 'ID', type: 'singleLineText' },
                    { name: 'Nombre', type: 'singleLineText' },
                    { name: 'Marca', type: 'singleLineText' },
                    { name: 'Modelo', type: 'singleLineText' },
                    { name: 'Número de Serie', type: 'singleLineText' },
                    { name: 'Categoría', type: 'singleSelect', options: { choices: [{name:'Laptop'},{name:'Desktop'},{name:'Monitor'}, {name:'Impresora'}, {name:'Otro'}] } },
                    { name: 'Estado', type: 'singleSelect', options: { choices: [{name:'Disponible'},{name:'Asignado'},{name:'En Reparación'}, {name:'Malogrado'}] } },
                    { name: 'Descripción', type: 'multilineText' },
                    { name: 'Foto', type: 'multipleAttachments' },
                    { name: 'Fecha de Compra', type: 'date', options: { dateFormat: { name: 'iso', format: 'YYYY-MM-DD' } } }
                ]});
            } else {
                // Verificar si falta Descripción
                const hasDesc = assets.fields.some(f => f.name === 'Descripción');
                if (!hasDesc) {
                    await api.addField(assets.id, { name: 'Descripción', type: 'multilineText' });
                }
            }

            // 2. Asegurar Tabla Empleados
            if (!tableNames.includes('Empleados')) {
                await api.createTable({ name: 'Empleados', fields: [
                    { name: 'Nombre Completo', type: 'singleLineText' },
                    { name: 'Cargo', type: 'singleLineText' },
                    { name: 'Departamento', type: 'singleSelect', options: { choices: [{name:'IT'},{name:'Ventas'},{name:'Administración'},{name:'Operaciones'}] } },
                    { name: 'Correo Electrónico', type: 'email' },
                    { name: 'Foto', type: 'multipleAttachments' }
                ]});
            }

            // 3. Asegurar Tabla Marcas
            if (!tableNames.includes('Marcas')) {
                await api.createTable({ name: 'Marcas', fields: [{ name: 'Nombre', type: 'singleLineText' }] });
            }

            // Recargar metadatos para obtener IDs de las nuevas tablas para las relaciones
            const updatedMeta = await api.getTables();
            const assetTable = updatedMeta.tables.find(t => t.name === 'Assets');
            const employeeTable = updatedMeta.tables.find(t => t.name === 'Empleados');

            // 4. Asegurar Tabla Asignaciones (Relaciones)
            if (!updatedMeta.tables.some(t => t.name === 'Asignaciones')) {
                await api.createTable({ name: 'Asignaciones', fields: [
                    { name: 'ID Asignación', type: 'singleLineText' },
                    { name: 'asset', type: 'multipleRecordLinks', options: { linkedTableId: assetTable.id } },
                    { name: 'employee', type: 'multipleRecordLinks', options: { linkedTableId: employeeTable.id } },
                    { name: 'assignmentDate', type: 'date', options: { dateFormat: { name: 'iso', format: 'YYYY-MM-DD' } } }
                ]});
            }

            alert("✓ Base de datos vinculada y sincronizada correctamente.");
            location.reload();
        } catch (e) { 
            console.error(e);
            alert("ERROR DE SINCRONIZACIÓN: Asegúrate de que tu Token tenga los permisos 'schema.bases:write' y 'data.records:write'. Detalles: " + e.message); 
        } finally { btn.disabled = false; btn.innerText = 'SINCRONIZAR AHORA'; }
    },
    
    showConfig() { document.getElementById('config-overlay').classList.remove('hidden'); },
    setLoading(l) { const s = document.getElementById('system-indicator'); if(s) s.style.background = l ? '#fbbf24' : '#10b981'; },
    notify(m) { 
        const t = document.createElement('div'); 
        t.style = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:12px 30px;border-radius:50px;z-index:10000;box-shadow:0 10px 30px rgba(0,0,0,0.3);font-weight:600;display:flex;align-items:center;gap:10px;animation:slideDown 0.3s ease-out"; 
        t.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981"></i> ${m}`; 
        document.body.appendChild(t); 
        setTimeout(()=> {
            t.style.animation = "slideUp 0.3s ease-in forwards";
            setTimeout(()=>t.remove(), 300);
        }, 3000); 
    },
    confirmSuccess(title, message, onContinue, onFinish) {
        const html = `
            <div style="text-align:center; padding: 10px 0;">
                <i class="fas fa-check-circle" style="font-size: 3.5rem; color: #10b981; margin-bottom: 20px; display: block;"></i>
                <p style="font-size: 1.1rem; color: #1e293b; margin-bottom: 30px; font-weight: 500;">${message}</p>
                <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 20px;">¿Deseas realizar otro registro similar?</p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="btn-success-continue" class="btn btn-primary" style="background: var(--primary-color) !important; color: white !important; flex: 1;">SÍ, SEGUIR</button>
                    <button id="btn-success-finish" class="btn" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 50px; padding: 8px 25px; font-weight: 700; cursor: pointer; flex: 1;">NO, ESTOY LISTO</button>
                </div>
            </div>
        `;
        this.openModal(title, html);
        document.getElementById('btn-success-continue').onclick = () => {
            this.closeModal();
            if (onContinue) onContinue();
        };
        document.getElementById('btn-success-finish').onclick = () => {
            this.closeModal();
            if (onFinish) onFinish();
        };
    }
};

document.addEventListener('DOMContentLoaded', () => ui.init());
