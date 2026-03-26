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
    employees: [], // Nueva lista para empleados
    currentEditId: null,
    searchQuery: ''
};

const api = {
    async request(path, method = 'GET', data = null, isMeta = false) {
        if (!state.config.baseId || !state.config.apiKey) {
            throw new Error('CONFIG_MISSING');
        }

        // --- LIMPIEZA INTELIGENTE DE CREDENCIALES ---
        let cleanBaseId = state.config.baseId.trim().replace(/\s/g, '');
        // Si el usuario pegó la URL de Airtable completa, extraemos el ID 'app...'
        if (cleanBaseId.includes('airtable.com/')) {
            const match = cleanBaseId.match(/app[a-zA-Z0-9]{14,}/);
            if (match) cleanBaseId = match[0];
        }

        // Limpiar el API Key de posibles prefijos "Bearer " o espacios
        const cleanApiKey = state.config.apiKey.replace(/Bearer\s+/i, '').trim().replace(/\s/g, '');

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
    // Nueva función para subir archivos y obtener URL pública temporal (requerido por Airtable)
    async uploadAttachment(recordId, fieldName, fileData) {
        try {
            // Subimos la imagen en base64 a un host público temporal para que Airtable la descargue
            const formData = new FormData();
            formData.append('key', '6d207e02198a847aa98d0a2a901485a5'); // FreeImage.host API pública
            formData.append('action', 'upload');
            formData.append('source', fileData.file);
            formData.append('format', 'json');

            const uploadRes = await fetch('https://freeimage.host/api/1/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) throw new Error('Error al subir imagen al servidor temporal');
            const data = await uploadRes.json();
            const imageUrl = data.image.url;

            // Ahora actualizamos el registro de Airtable con esa URL
            return await this.update('Assets', recordId, {
                [fieldName]: [{ url: imageUrl }]
            });
        } catch (err) {
            console.error("Error uploadAttachment:", err);
            throw err;
        }
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

            // Cargar Empleados desde la tabla 'Empleados'
            const employeesTable = await api.getAll('Empleados');
            const employeesMeta = meta.tables.find(t => t.name === 'Empleados');
            // Intentar detectar el nombre del campo principal o usar campos comunes
            const employeeNameField = employeesMeta?.primaryFieldId ?
                employeesMeta.fields.find(f => f.id === employeesMeta.primaryFieldId)?.name :
                'Nombre';

            if (employeesTable.length > 0) {
                state.employees = employeesTable.map(e => {
                    const fields = e.fields;
                    // Probar nombre detectado, luego fallbacks comunes
                    const name = fields[employeeNameField] || fields['Nombre'] || fields['Nombre '] || fields['Name'] || fields['Empleado'] || 'Sin Nombre';
                    return { id: e.id, name: name.trim() };
                }).filter(e => e.name && e.name !== 'Sin Nombre').sort((a, b) => a.name.localeCompare(b.name));
            }

            if (assetTable) {
                // Detección inteligente del campo de asignación (Linked Record a Empleados)
                const assignField = assetTable.fields.find(f =>
                    (f.type === 'multipleRecordLinks') &&
                    f.options?.foreignTableId === employeesMeta?.id
                );
                state.assetAssignmentField = assignField ? assignField.name : 'Asignado a';
                console.log("Columna de asignación detectada:", state.assetAssignmentField);

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
            filterCatSelect.innerHTML = '<option value="">-- Categorías --</option>' +
                uniqueCategories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // Poblar filtro de Asignaciones (Empleados)
        const filterAsigSelect = document.getElementById('mob-filter-assignee');
        if (filterAsigSelect) {
            filterAsigSelect.innerHTML = '<option value="">-- Asignaciones --</option>' +
                state.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        }

        const statusSel = document.getElementById('mob-status');
        if (statusSel) {
            statusSel.innerHTML = state.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
        }

        // Poblar select de Empleados
        const employeeSel = document.getElementById('mob-assignee');
        if (employeeSel) {
            employeeSel.innerHTML = '<option value="">-- Sin Asignar --</option>' +
                state.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        }
    },

    async refreshInventory() {
        const listContainer = document.getElementById('mob-inventory-list');
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div><p>Sincronizando...</p></div>';

        try {
            // Primero, intentamos obtener metadatos para verificar permisos y tablas
            let availableTables = [];
            try {
                const meta = await api.getTables();
                availableTables = (meta.tables || []).map(t => t.name);
            } catch (metaErr) {
                console.warn("No se pudo acceder al Meta API:", metaErr);
            }

            const [assets, assignments] = await Promise.all([
                api.getAll('Assets'),
                api.getAll('Asignaciones')
            ]);
            state.equipments = assets;
            state.assignments = assignments;
            this.populateSelects();
            this.renderList();
        } catch (e) {
            const is404 = e.message.includes('404') || e.message.toLowerCase().includes('not found');
            const is401 = e.message.includes('401') || e.message.toLowerCase().includes('unauthorized');

            let detailedMessage = e.message;
            if (is404) {
                // Buscamos si existe alguna tabla con nombre similar
                try {
                    const meta = await api.getTables();
                    const names = meta.tables.map(t => t.name).join(', ');
                    detailedMessage = `No se encontró la tabla 'Assets'. Tablas encontradas en esta base: [${names}]`;
                } catch (metaErr) {
                    detailedMessage = `Error 404: Base ID no encontrado o tabla 'Assets' no existe en esta Base.`;
                }
            } else if (is401) {
                detailedMessage = "Error 401: El Token (PAT) de Airtable es inválido o ha expirado.";
            }

            listContainer.innerHTML = `
                <div class="loader-container" style="padding: 20px;">
                    <p style="font-weight:bold; color:#1e293b; margin-bottom: 5px;">Error de Conexión</p>
                    <p style="font-size:0.8rem; color:#ef4444; margin: 10px 0; line-height: 1.4; background: #fee2e2; padding: 10px; border-radius: 8px; border: 1px solid #fecaca;">
                        ${detailedMessage}
                    </p>
                    <button onclick="ui.showConfigModal()" class="btn btn-primary-mobile" style="margin-top: 10px;">REVISAR CONFIGURACIÓN</button>
                    <p style="font-size:0.65rem; color:#64748b; margin-top: 15px;">Token: ${state.config.apiKey.slice(0, 5)}... | Base: ${state.config.baseId.slice(0, 5)}...</p>
                </div>`;
        }
    },

    renderList() {
        const listContainer = document.getElementById('mob-inventory-list');
        const itemsCount = document.getElementById('items-count');
        if (!listContainer) return;

        const searchTerm = document.getElementById('mob-search')?.value.toLowerCase() || '';
        const filterCat = document.getElementById('mob-filter-cat')?.value || '';
        const filterAsig = document.getElementById('mob-filter-assignee')?.value || '';

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

            // Filtro por Asignación (Empleado)
            let matchesAsig = true;
            if (filterAsig) {
                const asig = (state.assignments || []).find(a => a.fields.asset?.[0] === asset.id);
                matchesAsig = asig?.fields.employee?.[0] === filterAsig;
            }

            return matchesSearch && matchesCategory && matchesAsig;
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
                            ${(e.fields['Número de Serie'] || 'S/N').slice(0, 25)}
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
        const btnNewAsset = document.getElementById('btn-new-asset');
        if (btnNewAsset) {
            btnNewAsset.onclick = () => {
                this.resetForm();
                document.getElementById('form-modal-title').innerText = "Registrar Nuevo Equipo";
                document.getElementById('form-modal-overlay').classList.remove('hidden');
                document.getElementById('mob-id').value = this.generateNextMalId();
                
                const modalBody = document.querySelector('.full-screen-modal .modal-body');
                if (modalBody) modalBody.scrollTop = 0;
                
                setTimeout(() => {
                    const firstInput = document.getElementById('mob-brand');
                    if (firstInput) firstInput.focus();
                }, 300);
            };
        }

        const closeFormModal = document.getElementById('close-form-modal');
        if (closeFormModal) {
            closeFormModal.onclick = () => {
                this.resetForm();
                this.refreshInventory();
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

        if (document.getElementById('mob-filter-assignee')) {
            document.getElementById('mob-filter-assignee').onchange = () => this.renderList();
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

                    // Limpiar el campo de URL manual si se captura una foto nueva
                    const imgInput = document.getElementById('mob-img');
                    if (imgInput) imgInput.value = '';

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
                'Modelo': document.getElementById('mob-model').value || 'Genérico',
                'Categoría': document.getElementById('mob-cat').value,
                'Número de Serie': document.getElementById('mob-sn').value,
                'Estado': document.getElementById('mob-status').value,
                'Descripción': document.getElementById('mob-desc').value,
                'Fecha de Compra': document.getElementById('mob-purchase').value || null,
                'Nombre': `${document.getElementById('mob-brand').value} ${document.getElementById('mob-model').value || 'Genérico'}`
            };

            const imgUrl = this.formatImageUrl(document.getElementById('mob-img').value);
            if (this.tempFileData) {
                // Lo subimos después mediante update
                delete fields['Foto'];
            } else if (imgUrl) {
                fields['Foto'] = [{ url: imgUrl }];
            } else if (state.currentEditId) {
                // Para limpiar en un update en Airtable, usamos campo vacío
                fields['Foto'] = [];
            }

            const selectedEmployeeId = document.getElementById('mob-assignee').value;
            const currentAssignment = (state.assignments || []).find(a => a.fields.asset?.[0] === state.currentEditId);

            // Ajustar estado automáticamente si no se cambió manualmente
            if (selectedEmployeeId && fields['Estado'] === 'Disponible') fields['Estado'] = 'Asignado';
            else if (!selectedEmployeeId && fields['Estado'] === 'Asignado') fields['Estado'] = 'Disponible';

            let recordId = state.currentEditId;
            if (recordId) {
                await api.update('Assets', recordId, fields);
                this.showToast('✅ Registro Actualizado');
            } else {
                fields['ID'] = document.getElementById('mob-id').value || this.generateNextMalId();
                const newRecord = await api.create('Assets', fields);
                // Soporta tanto la vieja API (objeto simple) como la nueva (array results)
                recordId = newRecord.id || (newRecord.records && newRecord.records[0] ? newRecord.records[0].id : null);
                if (!recordId) throw new Error("Airtable no devolvió un ID válido.");
                this.showToast('✅ Registro Guardado');
            }

            // --- GESTIÓN DE TABLA ASIGNACIONES (Garantizar Coherencia) ---
            const isAsignado = (fields['Estado'] === 'Asignado');

            if (isAsignado && selectedEmployeeId) {
                // Si el estado es Asignado y hay un empleado, aseguramos que exista la asignación
                if (!currentAssignment || currentAssignment.fields.employee?.[0] !== selectedEmployeeId) {
                    if (currentAssignment) await api.delete('Asignaciones', currentAssignment.id);
                    await api.create('Asignaciones', {
                        'ID Asignación': `ASIG-${recordId.slice(-4)}-${Date.now().toString().slice(-4)}`,
                        'asset': [recordId],
                        'employee': [selectedEmployeeId],
                        'assignmentDate': new Date().toISOString().split('T')[0]
                    });
                }
            } else if (currentAssignment) {
                // Si el estado NO es 'Asignado', eliminamos cualquier asignación previa
                await api.delete('Asignaciones', currentAssignment.id);
            }
            // -------------------------------------------------------------

            // --- NUEVA SUBIDA DE IMAGEN ---
            if (this.tempFileData && recordId) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBIENDO IMAGEN...';
                try {
                    await api.uploadAttachment(recordId, 'Foto', this.tempFileData);
                    this.showToast('✅ Imagen guardada', 'success');
                } catch (imgError) {
                    console.error("Error guardando foto:", imgError);
                    this.showToast('⚠️ Datos guardados pero la imagen falló', 'error');
                }
                this.tempFileData = null; // Limpiar después de subir
            }

            // Cierre automático y refresco como solicitó el usuario
            this.resetForm(); // Limpiar y cerrar modal
            await this.refreshInventory();
        } catch (e) {
            const errorMsg = e.message || 'Error desconocido';
            this.showToast(`❌ Error: ${errorMsg}`, 'error');
            console.error("Detalle del error:", e);
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
        document.getElementById('form-modal-title').innerText = "Editar Equipo";
        document.getElementById('form-modal-overlay').classList.remove('hidden');

        // Llenar campos
        document.getElementById('mob-id').value = asset.fields.ID || '';
        document.getElementById('mob-brand').value = asset.fields.Marca || '';
        document.getElementById('mob-model').value = asset.fields.Modelo || '';
        document.getElementById('mob-sn').value = asset.fields['Número de Serie'] || '';
        document.getElementById('mob-status').value = asset.fields.Estado || '';

        // Cargar asignación desde la tabla separada (como en Desktop)
        const assignment = (state.assignments || []).find(a => a.fields.asset?.[0] === id);
        document.getElementById('mob-assignee').value = assignment ? assignment.fields.employee?.[0] : '';

        document.getElementById('mob-purchase').value = asset.fields['Fecha de Compra'] || '';
        document.getElementById('mob-desc').value = asset.fields.Descripción || '';

        const img = asset.fields.Foto?.[0]?.url || '';
        document.getElementById('mob-img').value = img;

        const preview = document.getElementById('mob-preview-box');
        preview.innerHTML = img ? `<img src="${img}">` : `<i class="fas fa-camera"></i><p>Pega un enlace abajo</p>`;

        // UI Feedback
        document.getElementById('mob-btn-save').innerHTML = '<i class="fas fa-check"></i> ACTUALIZAR ITEM';
        document.getElementById('mob-btn-cancel').classList.remove('hidden');

        // Scroll al formulario (contenedor principal móvil)
        document.querySelector('.mobile-main').scrollTo({ top: 0, behavior: 'smooth' });

        // Enfocar el primer campo usable (Marca)
        setTimeout(() => {
            document.getElementById('mob-brand').focus();
        }, 300);
    },

    async deleteAsset(id) {
        const wantsToDelete = await ui.confirm('¿Estás seguro de que deseas eliminar este registro permanentemente?', 'Eliminar Equipo');
        if (!wantsToDelete) return;
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
        this.clearForm();
        // Regresar al estado inicial: Cerrar el panel del formulario
        const modal = document.getElementById('form-modal-overlay');
        if (modal) modal.classList.add('hidden');
    },

    clearForm() {
        state.currentEditId = null;
        this.tempFileData = null; // Limpiar binario
        const form = document.getElementById('mobile-asset-form');
        if (form) form.reset();
        
        const preview = document.getElementById('mob-preview-box');
        if (preview) preview.innerHTML = `<i class="fas fa-camera"></i><p>Pega un enlace abajo</p>`;
        
        const btnSave = document.getElementById('mob-btn-save');
        if (btnSave) btnSave.innerHTML = '<i class="fas fa-save"></i> GUARDAR REGISTRO';
        
        const btnCancel = document.getElementById('mob-btn-cancel');
        if (btnCancel) btnCancel.classList.add('hidden');
        
        const idInput = document.getElementById('mob-id');
        if (idInput) idInput.value = this.generateNextMalId();
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
        document.getElementById('save-config').onclick = async () => {
            let bid = document.getElementById('config-base').value.trim();
            const key = document.getElementById('config-key').value.trim();
            
            if (!bid || !key) {
                await ui.alert('Por favor ingresa ambos datos para conectar.', 'Datos Incompletos');
                return;
            }

            // Normalización al guardar para evitar errores de persistencia
            if (bid.includes('airtable.com/')) {
                const match = bid.match(/app[a-zA-Z0-9]{14,}/);
                if (match) bid = match[0];
            }
            
            localStorage.setItem('airtable_base_id', bid);
            localStorage.setItem('airtable_api_key', key.replace(/Bearer\s+/i, '').trim());
            location.reload();
        };
    },

    closeModal() {
        document.getElementById('mob-modal-overlay').classList.add('hidden');
    },

    previewImage(url) {
        if (url) window.open(url, '_blank');
    },

    async confirm(msg, title = "Atención", isDanger = true) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('mob-confirm-overlay');
            document.getElementById('mob-confirm-title').innerText = title || "¿Estás seguro?";
            document.getElementById('mob-confirm-message').innerText = msg;
            
            const btnOk = document.getElementById('mob-confirm-ok');
            const btnCancel = document.getElementById('mob-confirm-cancel');
            
            if (isDanger) {
                btnOk.style.backgroundColor = 'var(--error)';
            } else {
                btnOk.style.backgroundColor = 'var(--success)';
            }

            // Asegurarnos de que el modal sea visible por encima de todo
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden');

            const cleanup = (result) => {
                overlay.classList.add('hidden');
                overlay.style.display = 'none';
                btnOk.onclick = null;
                btnCancel.onclick = null;
                resolve(result);
            };

            btnOk.onclick = () => cleanup(true);
            btnCancel.onclick = () => {
                console.log("Cancelando...");
                cleanup(false);
            };
        });
    },

    async alert(msg, title = "Mensaje") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('mob-confirm-overlay');
            document.getElementById('mob-confirm-title').innerText = title;
            document.getElementById('mob-confirm-message').innerText = msg;
            
            const btnOk = document.getElementById('mob-confirm-ok');
            const originalText = btnOk.innerText;
            const originalBg = btnOk.style.backgroundColor;

            btnOk.style.backgroundColor = 'var(--primary-color)';
            btnOk.innerText = "Aceptar";
            
            document.getElementById('mob-confirm-cancel').classList.add('hidden');

            const cleanup = () => {
                overlay.classList.add('hidden');
                document.getElementById('mob-confirm-cancel').classList.remove('hidden');
                btnOk.innerText = originalText;
                btnOk.style.backgroundColor = originalBg;
                btnOk.onclick = null;
                resolve();
            };

            btnOk.onclick = cleanup;
            overlay.classList.remove('hidden');
        });
    }
};

window.ui = ui; // Exponer ui globalmente para manejar los onclick del HTML

// Auto-Init
document.addEventListener('DOMContentLoaded', () => {
    ui.init();

    // Activar Pantalla Completa automáticamente al primer toque del usuario
    // (Los navegadores bloquean el "FullScreen" a menos que el usuario toque la pantalla)
    const activateFullScreen = () => {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log("Pantalla completa no soportada o bloqueada:", err.message);
            });
        }
        // Solo necesitamos que se active la primera vez, así que removemos el listener
        document.removeEventListener('click', activateFullScreen);
        document.removeEventListener('touchstart', activateFullScreen);
    };

    document.addEventListener('click', activateFullScreen);
    document.addEventListener('touchstart', activateFullScreen, { passive: true });

    // Interceptar el botón "Atrás" (Retroceso del sistema / navegador) de manera más confiable usando hash
    if (window.history && window.history.pushState) {
        // Empujar un estado falso para tener de donde retroceder
        window.history.pushState('forward', null, './#app');

        window.addEventListener('popstate', function(event) {
            const formModal = document.getElementById('form-modal-overlay');
            const configModal = document.getElementById('mob-modal-overlay');
            
            // Si hay alguna ventana emergente abierta, el botón atrás simplemente la cierra
            if (formModal && !formModal.classList.contains('hidden')) {
                ui.resetForm();
                // Volvemos a empujar el estado para seguir atrapando el botón "Atrás"
                window.history.pushState('forward', null, './#app');
                return;
            }
            if (configModal && !configModal.classList.contains('hidden')) {
                ui.closeModal();
                window.history.pushState('forward', null, './#app');
                return;
            }

            // Mostrar advertencia antes de salir usando el custom confirm
            ui.confirm("¿Estás seguro de que deseas salir de la aplicación?", "Salir de la app").then(wantsToExit => {
                if (wantsToExit) {
                    // Si acepta salir, retrocedemos nuevamente ya que nuestra "trampa" fue evadida
                    window.history.back(); 
                } else {
                    // Si el usuario cancela, volvemos a poner la "trampa"
                    window.history.pushState('forward', null, './#app');
                }
            });
        });
    }
});
