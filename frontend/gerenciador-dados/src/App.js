import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import TabelaEditor from './components/TabelaEditor';
import './App.css';

function App() {
    const [tabelas, setTabelas] = useState([]);
    const [erro, setErro] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const carregarTabelas = async () => {
            try {
                setCarregando(true);
                const response = await axios.get('http://192.168.1.124:3001/tabelas');
                console.log('Tabelas carregadas:', response.data);
                setTabelas(response.data);
                setErro(null);
            } catch (error) {
                console.error('Erro ao carregar tabelas:', error);
                setErro('Erro ao carregar tabelas. Verifique se o servidor está rodando.');
            } finally {
                setCarregando(false);
            }
        };
        carregarTabelas();
    }, []);

    const HomePage = () => {
        return (
            <div className="home-container">
                <header className="home-header">
                    <h1>Sistema de Gerenciamento de Dados</h1>
                    <p className="header-description">
                        Gerencie e administre suas tabelas de forma eficiente
                    </p>
                </header>
    
                {erro ? (
                    <div className="erro-mensagem">
                        <i className="fas fa-exclamation-circle"></i>
                        <span>{erro}</span>
                    </div>
                ) : carregando ? (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <span>Carregando tabelas...</span>
                    </div>
                ) : tabelas.length === 0 ? (
                    <div className="empty-state">
                        <i className="fas fa-database"></i>
                        <h2>Nenhuma Tabela Encontrada</h2>
                        <p>Não foram encontradas tabelas disponíveis no momento.</p>
                    </div>
                ) : (
                    <div className="dashboard-container">
                        <div className="dashboard-header">
                            <h2>Tabelas Disponíveis</h2>
                            <div className="total-info">
                                Total: {tabelas.length} tabelas
                            </div>
                        </div>
                        <div className="tabelas-grid">
                            {tabelas.map(tabela => (
                                <div
                                    key={tabela.TABLE_NAME}
                                    className="tabela-card"
                                    onClick={() => navigate(`/tabela/${tabela.TABLE_NAME}`)}
                                >
                                    <div className="card-icon">
                                        <i className="fas fa-table"></i>
                                    </div>
                                    <div className="card-content">
                                        <h3>{tabela.TABLE_NAME}</h3>
                                        <p className="card-info">
                                            {tabela.COLUMN_COUNT} colunas
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="container">
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/tabela/:nomeTabela" element={<TabelaEditor />} />
            </Routes>
        </div>
    );
}

export default App;