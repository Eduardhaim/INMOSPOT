
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Cliente = sequelize.define('Cliente', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    apellido: {
        type: DataTypes.STRING,
        allowNull: false
    },
    telefono: {
        type: DataTypes.STRING,
        allowNull: false
    },
    correo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    direccion: {
        type: DataTypes.STRING,
        allowNull: true
    },
    tipo: {
        type: DataTypes.ENUM(
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario'
        ),
        allowNull: false
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        references: {
            model: 'usuarios',
            key: 'id'
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
    }
}, {
    tableName: 'clientes',
    timestamps: false
})

module.exports = Cliente
