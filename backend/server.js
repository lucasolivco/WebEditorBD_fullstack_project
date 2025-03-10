const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
// app.use(cors());
app.use(bodyParser.json());

// Permitir todas as origens
app.use(cors({
    origin: '*', // Permite qualquer origem
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
    allowedHeaders: ['Content-Type', 'Authorization'] // Cabeçalhos permitidos
}));

const dbConfig = {
    user: '',
    password: '',
    server: '',
    database: '',
    options: {
        trustServerCertificate: true,
        encrypt: false,
        enableArithAbort: true
    }
};

sql.connect(dbConfig).then(() => {
    console.log('Conexão com o banco de dados bem-sucedida!');
  }).catch((err) => {
    console.error('Erro ao conectar ao banco de dados:', err);
  });

const executarQuery = async (query, params = []) => {
    try {
        await sql.connect(dbConfig);
        const request = new sql.Request();
        params.forEach(param => request.input(param.name, param.type, param.value));
        const result = await request.query(query);
        return result.recordset;
    } catch (err) {
        console.error('Erro ao executar a consulta:', err);
        throw err;
    }
};

// Função para obter informações sobre chaves estrangeiras
const obterChavesEstrangeiras = async (tabela) => {
    const query = `
        SELECT 
            fk.name AS FK_Nome,
            OBJECT_NAME(fk.parent_object_id) AS TabelaOrigem,
            COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColunaOrigem,
            OBJECT_NAME(fk.referenced_object_id) AS TabelaReferencia,
            COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ColunaReferencia
        FROM 
            sys.foreign_keys AS fk
            INNER JOIN sys.foreign_key_columns AS fkc 
                ON fk.object_id = fkc.constraint_object_id
        WHERE 
            OBJECT_NAME(fk.parent_object_id) = @tabela`;

    return await executarQuery(query, [
        { name: 'tabela', type: sql.VarChar(100), value: tabela }
    ]);
};

// Função para construir a cláusula WHERE baseada nos filtros
const construirWhereFiltros = (filtros, params) => {
    if (!filtros || Object.keys(filtros).length === 0) return '';
    
    const condicoes = Object.entries(filtros).map(([coluna, valor], index) => {
        const paramName = `filtro${index}`;
        params.push({
            name: paramName,
            value: `%${valor}%`,
            type: sql.VarChar(500)
        });
        return `${coluna} LIKE @${paramName}`;
    });
    
    return 'WHERE ' + condicoes.join(' AND ');
};

// Adicione este endpoint no server.js (antes do app.listen)
app.get('/tabelas', async (req, res) => {
    try {
        const query = `
            SELECT 
                t.TABLE_NAME,
                (SELECT COUNT(*) FROM ${dbConfig.database}.INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_NAME = t.TABLE_NAME) as COLUMN_COUNT
            FROM ${dbConfig.database}.INFORMATION_SCHEMA.TABLES t
            WHERE 
                t.TABLE_TYPE = 'BASE TABLE' 
                AND t.TABLE_SCHEMA = 'dbo'
                AND t.TABLE_NAME NOT LIKE 'sys%'
                AND t.TABLE_NAME NOT LIKE 'MS%'
            ORDER BY t.TABLE_NAME
        `;
        
        console.log('Executando consulta de tabelas:', query); // Debug
        const tabelas = await executarQuery(query);
        console.log('Tabelas encontradas:', tabelas); // Debug
        res.json(tabelas);
    } catch (err) {
        console.error('Erro ao buscar tabelas:', err);
        res.status(500).send('Erro ao buscar tabelas: ' + err.message);
    }
});

// Endpoint para obter estrutura da tabela incluindo informações de FK
app.get('/estrutura/:tabela', async (req, res) => {
    try {
        const { tabela } = req.params;
        
        // Obtém informações básicas das colunas
        const estruturaQuery = `
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                CHARACTER_MAXIMUM_LENGTH,
                IS_NULLABLE,
                COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IS_IDENTITY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tabela
        `;
        const estrutura = await executarQuery(estruturaQuery, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);

        // Obtém informações sobre chaves estrangeiras
        const fks = await obterChavesEstrangeiras(tabela);

        // Combina as informações
        const estruturaCompleta = estrutura.map(coluna => {
            const fk = fks.find(fk => fk.ColunaOrigem === coluna.COLUMN_NAME);
            return {
                ...coluna,
                FK: fk ? {
                    tabelaReferencia: fk.TabelaReferencia,
                    colunaReferencia: fk.ColunaReferencia
                } : null
            };
        });

        res.json(estruturaCompleta);
    } catch (err) {
        console.error('Erro ao buscar estrutura:', err);
        res.status(500).send('Erro ao buscar estrutura da tabela: ' + err.message);
    }
});

// Endpoint para obter valores possíveis para FKs
app.get('/referencias/:tabela/:coluna', async (req, res) => {
    try {
        const { tabela, coluna } = req.params;
        const query = `SELECT * FROM ${tabela}`;
        const valores = await executarQuery(query);
        res.json(valores);
    } catch (err) {
        res.status(500).send('Erro ao buscar referências');
    }
});

// Endpoint para adicionar novo registro
app.post('/dados/:tabela', async (req, res) => {
    const { tabela } = req.params;
    const dados = req.body;
    
    try {
        // Obtém a estrutura da tabela
        const estruturaQuery = `
            SELECT 
                COLUMN_NAME,
                COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IS_IDENTITY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tabela
        `;
        
        const estrutura = await executarQuery(estruturaQuery, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);
        
        // Filtra colunas não-identity
        const colunas = estrutura
            .filter(col => !col.IS_IDENTITY)
            .map(col => col.COLUMN_NAME)
            .filter(colName => dados.hasOwnProperty(colName));
            
        if (colunas.length === 0) {
            throw new Error('Nenhuma coluna válida para inserção');
        }

        const valores = colunas.map(col => `@${col}`);
        
        const query = `
            INSERT INTO ${tabela} (${colunas.join(', ')})
            VALUES (${valores.join(', ')})
        `;
        
        const params = colunas.map(colName => ({
            name: colName,
            value: dados[colName],
            type: typeof dados[colName] === 'number' ? sql.Int : sql.VarChar(500)
        }));

        await executarQuery(query, params);
        res.send('Registro inserido com sucesso');
    } catch (err) {
        console.error('Erro ao inserir:', err);
        res.status(500).send('Erro ao inserir dados: ' + err.message);
    }
});

// Endpoint atualizado para dados com paginação e filtros
app.get('/dados/:tabela', async (req, res) => {
    try {
        const { tabela } = req.params;
        const { pagina = 1, itensPorPagina = 10, filtros } = req.query;
        const offset = (pagina - 1) * itensPorPagina;
        
        // Verificar se a tabela existe
        const verificaTabela = await executarQuery(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = @tabela AND TABLE_SCHEMA = 'dbo'
        `, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);

        if (verificaTabela.length === 0) {
            throw new Error(`Tabela '${tabela}' não encontrada`);
        }

        // Obter a chave primária da tabela
        const pkQuery = `
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + QUOTENAME(CONSTRAINT_NAME)), 'IsPrimaryKey') = 1
            AND TABLE_NAME = @tabela
        `;
        
        const pkResult = await executarQuery(pkQuery, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);
        
        const pkColumn = pkResult.length > 0 ? pkResult[0].COLUMN_NAME : null;

        // Parse dos filtros
        const filtrosObj = filtros ? JSON.parse(filtros) : {};
        const params = [];
        const whereFiltros = construirWhereFiltros(filtrosObj, params);

        // Query para contar total de registros
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM ${tabela}
            ${whereFiltros}
        `;
        
        const totalRegistros = await executarQuery(countQuery, params);
        
        // Query principal com paginação
        const query = `
            SELECT *
            FROM ${tabela}
            ${whereFiltros}
            ORDER BY ${pkColumn || '(SELECT NULL)'}
            OFFSET ${offset} ROWS
            FETCH NEXT ${itensPorPagina} ROWS ONLY
        `;

        console.log('Executando query:', query); // Debug
        const dados = await executarQuery(query, params);
        
        res.json({
            dados,
            paginacao: {
                pagina: parseInt(pagina),
                itensPorPagina: parseInt(itensPorPagina),
                totalRegistros: totalRegistros[0].total,
                totalPaginas: Math.ceil(totalRegistros[0].total / itensPorPagina)
            }
        });
    } catch (err) {
        console.error('Erro ao buscar dados:', err);
        res.status(500).send('Erro ao buscar dados: ' + err.message);
    }
});

// Endpoint para atualizar um registro existente
app.put('/dados/:tabela/:id', async (req, res) => {
    try {
        const { tabela, id } = req.params;
        const { chavePrimaria } = req.query;
        const dados = req.body;

        // Se não foi fornecida uma chave primária, tenta encontrar uma
        let pkColumn = chavePrimaria;
        if (!pkColumn) {
            const pkQuery = `
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + QUOTENAME(CONSTRAINT_NAME)), 'IsPrimaryKey') = 1
                AND TABLE_NAME = @tabela
            `;
            
            const pkResult = await executarQuery(pkQuery, [
                { name: 'tabela', type: sql.VarChar(100), value: tabela }
            ]);
            
            pkColumn = pkResult.length > 0 ? pkResult[0].COLUMN_NAME : null;
        }

        if (!pkColumn) {
            // Se ainda não encontrou PK, procura por coluna identity
            const identityQuery = `
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @tabela
                AND COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsIdentity') = 1
            `;
            
            const identityResult = await executarQuery(identityQuery, [
                { name: 'tabela', type: sql.VarChar(100), value: tabela }
            ]);
            
            pkColumn = identityResult.length > 0 ? identityResult[0].COLUMN_NAME : 'id';
        }

        console.log('Atualizando registro:', {
            tabela,
            id,
            chavePrimaria: pkColumn,
            dados
        });

        const query = `
            UPDATE ${tabela}
            SET ${Object.keys(dados)
                .filter(key => key !== pkColumn)
                .map(key => `${key} = @${key}`)
                .join(', ')}
            WHERE ${pkColumn} = @id
        `;

        const params = [
            { name: 'id', type: sql.Int, value: parseInt(id) },
            ...Object.entries(dados)
                .filter(([key]) => key !== pkColumn)
                .map(([key, value]) => ({
                    name: key,
                    type: typeof value === 'number' ? sql.Int : sql.VarChar(500),
                    value: value
                }))
        ];

        await executarQuery(query, params);
        res.json({ message: 'Registro atualizado com sucesso' });
    } catch (err) {
        console.error('Erro ao atualizar registro:', err);
        res.status(500).send('Erro ao atualizar registro: ' + err.message);
    }
});

app.get('/debug/tabela/:tabela', async (req, res) => {
    try {
        const { tabela } = req.params;
        
        // Verificar estrutura da tabela
        const estrutura = await executarQuery(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IS_IDENTITY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tabela
        `, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);

        // Verificar chaves primárias
        const pks = await executarQuery(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + QUOTENAME(CONSTRAINT_NAME)), 'IsPrimaryKey') = 1
            AND TABLE_NAME = @tabela
        `, [
            { name: 'tabela', type: sql.VarChar(100), value: tabela }
        ]);

        // Verificar chaves estrangeiras
        const fks = await obterChavesEstrangeiras(tabela);

        // Contar registros
        const countQuery = `SELECT COUNT(*) as total FROM ${tabela}`;
        const count = await executarQuery(countQuery);

        res.json({
            tabela,
            estrutura,
            chavePrimaria: pks,
            chavesEstrangeiras: fks,
            totalRegistros: count[0].total
        });
    } catch (err) {
        console.error('Erro ao debugar tabela:', err);
        res.status(500).send('Erro ao debugar tabela: ' + err.message);
    }
});

app.listen(3001, '0.0.0.0', () => {
    console.log('Servidor rodando na porta 3001 e acessível na rede local');
});