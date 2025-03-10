import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './TabelaEditor.css';

const Modal = React.memo(({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
                {children}
            </div>
        </div>
    );
});

const FiltrosModal = React.memo(({ isOpen, onClose, estrutura, filtros, onFiltroChange }) => {
    const [filtrosTemp, setFiltrosTemp] = useState(filtros);

    const handleAplicarFiltros = () => {
        onFiltroChange(filtrosTemp);
        onClose();
    };

    const handleLimparFiltros = () => {
        setFiltrosTemp({});
        onFiltroChange({});
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="filtros-modal">
                <h3>Filtrar Registros</h3>
                <div className="filtros-content">
                    {estrutura.map(coluna => (
                        <div key={`filtro-${coluna.COLUMN_NAME}`} className="filtro-campo">
                            <label>{coluna.COLUMN_NAME}</label>
                            <input
                                type="text"
                                placeholder={`Filtrar por ${coluna.COLUMN_NAME}`}
                                value={filtrosTemp[coluna.COLUMN_NAME] || ''}
                                onChange={(e) => setFiltrosTemp(prev => ({
                                    ...prev,
                                    [coluna.COLUMN_NAME]: e.target.value
                                }))}
                            />
                        </div>
                    ))}
                </div>
                <div className="filtros-footer">
                    <button className="submit-btn" onClick={handleAplicarFiltros}>
                        Aplicar Filtros
                    </button>
                    <button className="clear-btn" onClick={handleLimparFiltros}>
                        Limpar Filtros
                    </button>
                    <button className="cancel-btn" onClick={onClose}>
                        Cancelar
                    </button>
                </div>
            </div>
        </Modal>
    );
});

const FiltrosAtivos = React.memo(({ filtros, onRemoverFiltro }) => {
    if (Object.keys(filtros).length === 0) return null;

    return (
        <div className="filtros-ativos">
            {Object.entries(filtros).map(([coluna, valor]) => (
                <div key={coluna} className="filtro-tag">
                    <span>{coluna}: {valor}</span>
                    <button onClick={() => onRemoverFiltro(coluna)}>×</button>
                </div>
            ))}
        </div>
    );
});

const FormularioEdicao = React.memo(({ 
    estrutura, 
    formDadosEdicao, 
    handleChangeEdicao, 
    handleSubmitEdicao, 
    handleCancelarEdicao, 
    errosValidacao, 
    renderInput 
}) => {
    return (
        <div className="form-section">
            <h3>Editar Registro</h3>
            <form onSubmit={handleSubmitEdicao} className="formulario editing">
                {estrutura.map(coluna => (
                    !coluna.IS_IDENTITY && (
                        <div key={`edit-${coluna.COLUMN_NAME}`} className="form-group">
                            <label>{coluna.COLUMN_NAME}</label>
                            {renderInput(coluna, formDadosEdicao, handleChangeEdicao)}
                            {errosValidacao[coluna.COLUMN_NAME] && (
                                <span className="erro-validacao">
                                    {errosValidacao[coluna.COLUMN_NAME]}
                                </span>
                            )}
                        </div>
                    )
                ))}
                <div className="form-buttons">
                    <button type="submit" className="submit-btn">Atualizar</button>
                    <button 
                        type="button" 
                        className="cancel-btn"
                        onClick={handleCancelarEdicao}
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
});

function TabelaEditor() {
    const [chavePrimaria, setChavePrimaria] = useState(null);

    // Hooks de roteamento
    const navigate = useNavigate();
    const { nomeTabela } = useParams();

    const [showNovoRegistro, setShowNovoRegistro] = useState(false);
    const [showFiltros, setShowFiltros] = useState(false);

    // Estados principais
    const [estrutura, setEstrutura] = useState([]);
    const [dados, setDados] = useState([]);
    const [valoresFk, setValoresFk] = useState({});
    const [carregando, setCarregando] = useState(false);

    // Estados de formulário
    const [formDadosNovo, setFormDadosNovo] = useState({});
    const [formDadosEdicao, setFormDadosEdicao] = useState({});
    const [editandoId, setEditandoId] = useState(null);
    const [errosValidacao, setErrosValidacao] = useState({});

    // Estados de filtragem e paginação
    const [filtros, setFiltros] = useState({});
    const [paginacao, setPaginacao] = useState({
        pagina: 1,
        itensPorPagina: 10,
        totalPaginas: 1,
        totalRegistros: 0
    });

    const [showFiltrosModal, setShowFiltrosModal] = useState(false);

    const handleRemoverFiltro = (coluna) => {
        const novosFiltros = { ...filtros };
        delete novosFiltros[coluna];
        setFiltros(novosFiltros);
    };

    // Funções de carregamento de dados
    const carregarDados = useCallback(async () => {
        if (!nomeTabela) return;
        setCarregando(true);
        try {
            const response = await axios.get(`http://192.168.1.124:3001/dados/${nomeTabela}`, {
                params: {
                    pagina: paginacao.pagina,
                    itensPorPagina: paginacao.itensPorPagina,
                    filtros: JSON.stringify(filtros)
                }
            });
            setDados(response.data.dados);
            setPaginacao(prev => ({
                ...prev,
                totalPaginas: response.data.paginacao.totalPaginas,
                totalRegistros: response.data.paginacao.totalRegistros
            }));
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setCarregando(false);
        }
    }, [nomeTabela, paginacao.pagina, paginacao.itensPorPagina, filtros]);

    const carregarEstrutura = useCallback(async () => {
        if (!nomeTabela) return;
        try {
            const response = await axios.get(`http://192.168.1.124:3001/estrutura/${nomeTabela}`);
            setEstrutura(response.data);
            
            // Tenta identificar a chave primária
            const pk = response.data.find(coluna => coluna.IS_IDENTITY === true);
            if (pk) {
                setChavePrimaria(pk.COLUMN_NAME);
            } else {
                // Se não encontrar coluna identity, usa a primeira coluna como fallback
                setChavePrimaria(response.data[0]?.COLUMN_NAME || 'id');
            }
            
            // Carrega valores possíveis para FKs
            response.data.forEach(async (coluna) => {
                if (coluna.FK) {
                    const refResponse = await axios.get(
                        `http://192.168.1.124:3001/referencias/${coluna.FK.tabelaReferencia}/${coluna.FK.colunaReferencia}`
                    );
                    setValoresFk(prev => ({
                        ...prev,
                        [coluna.COLUMN_NAME]: refResponse.data
                    }));
                }
            });
        } catch (error) {
            console.error('Erro ao carregar estrutura:', error);
        }
    }, [nomeTabela]);

    // Handlers de formulário
    const handleChangeNovo = (campo, valor) => {
        setFormDadosNovo(prev => ({ ...prev, [campo]: valor }));
        setErrosValidacao(prev => ({ ...prev, [campo]: null }));
    };

    const handleChangeEdicao = useCallback((campo, valor) => {
        setFormDadosEdicao(prev => ({ ...prev, [campo]: valor }));
        setErrosValidacao(prev => ({ ...prev, [campo]: null }));
    }, []);
    
    const handleEditar = useCallback((registro) => {
        console.log('Registro para editar:', registro);
        console.log('Chave primária atual:', chavePrimaria);
        
        if (!chavePrimaria) {
            console.error('Chave primária não definida');
            return;
        }
    
        const id = registro[chavePrimaria];
        console.log('ID identificado:', id);
    
        if (id) {
            setEditandoId(id);
            setFormDadosEdicao(registro);
        } else {
            console.error('ID não encontrado no registro:', registro);
            console.error('Tentando chave primária:', chavePrimaria);
        }
    }, [chavePrimaria]);
    
    const handleCancelarEdicao = useCallback(() => {
        setEditandoId(null);
        setFormDadosEdicao({});
    }, []);

    // Funções de submissão
    const validarFormulario = (dadosForm) => {
        const erros = {};
        estrutura.forEach(coluna => {
            if (!coluna.IS_IDENTITY) {
                const valor = dadosForm[coluna.COLUMN_NAME];
                
                if (coluna.IS_NULLABLE === 'NO' && !valor) {
                    erros[coluna.COLUMN_NAME] = 'Campo obrigatório';
                }
                
                if (coluna.DATA_TYPE === 'varchar' && 
                    valor && 
                    valor.length > coluna.CHARACTER_MAXIMUM_LENGTH) {
                    erros[coluna.COLUMN_NAME] = `Máximo de ${coluna.CHARACTER_MAXIMUM_LENGTH} caracteres`;
                }
                
                if (coluna.DATA_TYPE === 'int' && valor && isNaN(valor)) {
                    erros[coluna.COLUMN_NAME] = 'Deve ser um número';
                }
            }
        });
        
        setErrosValidacao(erros);
        return Object.keys(erros).length === 0;
    };

    const handleSubmitNovo = async (e) => {
        e.preventDefault();
        if (!validarFormulario(formDadosNovo)) return;

        try {
            await axios.post(`http://192.168.1.124:3001/dados/${nomeTabela}`, formDadosNovo);
            setFormDadosNovo({});
            carregarDados();
        } catch (error) {
            console.error('Erro ao salvar novo registro:', error);
        }
    };

    const handleSubmitEdicao = async (e) => {
        e.preventDefault();
        if (!validarFormulario(formDadosEdicao)) return;
    
        try {
            console.log('Enviando atualização:', {
                id: editandoId,
                chavePrimaria: chavePrimaria,
                dados: formDadosEdicao
            });
    
            await axios.put(
                `http://192.168.1.124:3001/dados/${nomeTabela}/${editandoId}?chavePrimaria=${chavePrimaria}`, 
                formDadosEdicao
            );
            setEditandoId(null);
            setFormDadosEdicao({});
            carregarDados();
        } catch (error) {
            console.error('Erro ao atualizar registro:', error);
            alert('Erro ao atualizar o registro: ' + error.message);
        }
    };

    // Handlers de filtro e paginação
    const handleFiltroChange = (coluna, valor) => {
        setFiltros(prev => ({ ...prev, [coluna]: valor }));
        setPaginacao(prev => ({ ...prev, pagina: 1 }));
    };

    // Funções de renderização
    const renderInput = useCallback((coluna, formData, onChange) => {
        if (coluna.FK) {
            return (
                <select
                    value={formData[coluna.COLUMN_NAME] || ''}
                    onChange={(e) => onChange(coluna.COLUMN_NAME, e.target.value)}
                    className={errosValidacao[coluna.COLUMN_NAME] ? 'input-erro' : ''}
                >
                    <option value="">Selecione...</option>
                    {valoresFk[coluna.COLUMN_NAME]?.map(valor => (
                        <option 
                            key={valor[coluna.FK.colunaReferencia]} 
                            value={valor[coluna.FK.colunaReferencia]}
                        >
                            {valor[coluna.FK.colunaReferencia]} - {valor.nome || valor.descricao || valor[coluna.FK.colunaReferencia]}
                        </option>
                    ))}
                </select>
            );
        }
    
        return (
            <input
                type={coluna.DATA_TYPE === 'int' ? 'number' : 'text'}
                value={formData[coluna.COLUMN_NAME] || ''}
                onChange={(e) => onChange(coluna.COLUMN_NAME, e.target.value)}
                className={errosValidacao[coluna.COLUMN_NAME] ? 'input-erro' : ''}
            />
        );
    }, [errosValidacao, valoresFk]);

    // Effects
    useEffect(() => {
        carregarEstrutura();
    }, [carregarEstrutura]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    
    // Render do componente
    return (
        <div className="tabela-editor">
            <div className="header">
                <h2>Editar {nomeTabela}</h2>
                <div className="header-buttons">
                    <button 
                        className="add-btn"
                        onClick={() => setShowNovoRegistro(true)}
                    >
                        Adicionar Registro
                    </button>
                    <button 
                        className="filter-btn"
                        onClick={() => setShowFiltrosModal(true)}
                    >
                        Filtrar
                    </button>
                    <button className="voltar-btn" onClick={() => navigate('/')}>
                        Voltar
                    </button>
                </div>
            </div>
    
            {/* Área de Conteúdo Principal */}
            <div className="conteudo-principal">
                <FiltrosAtivos 
                    filtros={filtros} 
                    onRemoverFiltro={handleRemoverFiltro}
                />
                {/* Filtros */}
                {showFiltros && (
                    <div className="filtros-container">
                        <div className="filtros">
                            {estrutura.map(coluna => (
                                <div key={`filtro-${coluna.COLUMN_NAME}`} className="filtro-campo">
                                    <label>{coluna.COLUMN_NAME}</label>
                                    <input
                                        type="text"
                                        placeholder={`Filtrar ${coluna.COLUMN_NAME}`}
                                        value={filtros[coluna.COLUMN_NAME] || ''}
                                        onChange={(e) => handleFiltroChange(coluna.COLUMN_NAME, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
            <FiltrosModal
                isOpen={showFiltrosModal}
                onClose={() => setShowFiltrosModal(false)}
                estrutura={estrutura}
                filtros={filtros}
                onFiltroChange={setFiltros}
            />
    
                {/* Container da Tabela */}
                <div className="tabela-container">
                    {carregando ? (
                        <div className="carregando">Carregando...</div>
                    ) : (
                        <table className="tabela-dados">
                            <thead>
                                <tr>
                                    {estrutura.map(coluna => (
                                        <th key={coluna.COLUMN_NAME}>{coluna.COLUMN_NAME}</th>
                                    ))}
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dados.map(registro => (
                                    <tr key={registro.id_resp_fiscal || registro.id}>
                                        {estrutura.map(coluna => (
                                            <td key={coluna.COLUMN_NAME}>
                                                {coluna.FK 
                                                    ? valoresFk[coluna.COLUMN_NAME]?.find(
                                                        v => v[coluna.FK.colunaReferencia] === registro[coluna.COLUMN_NAME]
                                                    )?.[coluna.FK.colunaReferencia]
                                                    : registro[coluna.COLUMN_NAME]
                                                }
                                            </td>
                                        ))}
                                        <td>
                                            <button 
                                                onClick={() => handleEditar(registro)}
                                                className="botao-editar"
                                            >
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
    
                {/* Paginação */}
                {!carregando && (
                    <div className="paginacao">
                        <div className="paginacao-controles">
                            <button
                                className="paginacao-btn"
                                disabled={paginacao.pagina === 1}
                                onClick={() => setPaginacao(prev => ({ ...prev, pagina: prev.pagina - 1 }))}
                            >
                                Anterior
                            </button>
                            
                            <span className="paginacao-info">
                                Página {paginacao.pagina} de {paginacao.totalPaginas} 
                                ({paginacao.totalRegistros} registros)
                            </span>
                            
                            <button
                                className="paginacao-btn"
                                disabled={paginacao.pagina === paginacao.totalPaginas}
                                onClick={() => setPaginacao(prev => ({ ...prev, pagina: prev.pagina + 1 }))}
                            >
                                Próxima
                            </button>
    
                            <select
                                className="paginacao-select"
                                value={paginacao.itensPorPagina}
                                onChange={(e) => setPaginacao(prev => ({ 
                                    ...prev, 
                                    itensPorPagina: parseInt(e.target.value),
                                    pagina: 1 
                                }))}
                            >
                                <option value="10">10 por página</option>
                                <option value="25">25 por página</option>
                                <option value="50">50 por página</option>
                                <option value="100">100 por página</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>
    
            {/* Modais */}
            <Modal 
                isOpen={showNovoRegistro}
                onClose={() => setShowNovoRegistro(false)}
            >
                <div className="form-section">
                    <h3>Adicionar Novo Registro</h3>
                    <form onSubmit={handleSubmitNovo} className="formulario">
                        {estrutura.map(coluna => (
                            !coluna.IS_IDENTITY && (
                                <div key={`novo-${coluna.COLUMN_NAME}`} className="form-group">
                                    <label>{coluna.COLUMN_NAME}</label>
                                    {renderInput(coluna, formDadosNovo, handleChangeNovo)}
                                    {errosValidacao[coluna.COLUMN_NAME] && (
                                        <span className="erro-validacao">
                                            {errosValidacao[coluna.COLUMN_NAME]}
                                        </span>
                                    )}
                                </div>
                            )
                        ))}
                        <div className="form-buttons">
                            <button type="submit" className="submit-btn">Adicionar</button>
                            <button 
                                type="button" 
                                className="cancel-btn"
                                onClick={() => setShowNovoRegistro(false)}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
    
            <Modal 
                isOpen={editandoId !== null}
                onClose={handleCancelarEdicao}
            >
                <FormularioEdicao 
                    estrutura={estrutura}
                    formDadosEdicao={formDadosEdicao}
                    handleChangeEdicao={handleChangeEdicao}
                    handleSubmitEdicao={handleSubmitEdicao}
                    handleCancelarEdicao={handleCancelarEdicao}
                    errosValidacao={errosValidacao}
                    renderInput={renderInput}
                />
            </Modal>
        </div>
    );
}


export default React.memo(TabelaEditor);