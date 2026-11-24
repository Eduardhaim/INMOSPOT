
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Usuario = sequelize.define('Usuario', {
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
    correo: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    contrasena: {
        type: DataTypes.STRING,
        allowNull: false
    },
    rol: {
        type: DataTypes.ENUM(
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario',
            'agente'
        ),
        allowNull: false
    }
}, {
    tableName: 'usuarios',
    timestamps: false
})

module.exports = Usuario
