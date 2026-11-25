const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Propiedad = sequelize.define('Propiedad', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    titulo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    tipo: {
        type: DataTypes.ENUM(
            'casa',
            'apartamento',
            'terreno',
            'local'
        ),
        allowNull: false
    },
    finalidad: {
        type: DataTypes.ENUM('venta', 'alquiler'),
        allowNull: false
    },
    precio: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },
    ubicacion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    zona: {
        type: DataTypes.STRING,
        allowNull: false
    },
    caracteristicas: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    estado: {
        type: DataTypes.ENUM(
            'disponible',
            'reservada',
            'alquilada',
            'vendida'
        ),
        allowNull: false,
        defaultValue: 'disponible'
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'usuarios',
            key: 'id'
        },
        onDelete: 'RESTRICT'
    }
}, {
    tableName: 'propiedades',
    timestamps: false
})

module.exports = Propiedad
