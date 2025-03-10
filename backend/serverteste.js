const sql = require('mssql');

const config = {
    user: '',
    password: '',
    server: '', // ou o IP do seu servidor SQL  
    database: '',
    options: {
        trustServerCertificate: true // Use true para evitar problemas de certificado em ambientes locais
    }
};

async function testConnection() {
    try {
        // Conecta ao banco de dados
        let pool = await sql.connect(config);
        console.log('Conexão bem-sucedida!');

        // Realiza uma consulta simples
        const result = await pool.request().query('SELECT 1 AS test');
        console.log(result.recordset);
    } catch (err) {
        console.error('Erro ao conectar:', err);
    } finally {
        // Fecha a conexão
        await sql.close();
    }
}

testConnection();
