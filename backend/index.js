const express = require('express')
const sequelize = require('./db/connection')
const Usuario = require('./Modelos/Usuario')
const bcrypt = require('bcryptjs')
const { randomBytes } = require('node:crypto')

const app = express()
const sesiones = new Map()

app.use(express.json())

// Ruta principal
app.get('/', (req, resp) => {
    resp.status(200).json({
        mensaje: 'API INMOSPOT funcionando'
    })
})

// Registro de usuarios
app.post('/registro', async (req, resp) => {
    try {
        const { nombre, apellido, correo, contrasena, rol } = req.body

        if (![nombre, apellido, correo, contrasena].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Todos los campos son obligatorios'
            })
        }

        const roles = [
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario'
        ]

        if (!roles.includes(rol)) {
            return resp.status(400).json({
                mensaje: 'Rol no valido'
            })
        }

        if (contrasena.length < 8 ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'La contrasena debe tener al menos 8 caracteres y maximo 72 bytes'
            })
        }

        const correoNormalizado = correo.trim().toLowerCase()

        const existe = await Usuario.findOne({
            where: { correo: correoNormalizado }
        })

        if (existe) {
            return resp.status(409).json({
                mensaje: 'El correo ya esta registrado'
            })
        }

        const contrasenaProtegida = await bcrypt.hash(contrasena, 10)

        const usuario = await Usuario.create({
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            correo: correoNormalizado,
            contrasena: contrasenaProtegida,
            rol: rol
        })

        resp.status(201).json({
            mensaje: 'Usuario registrado correctamente',
            id: usuario.id
        })

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El correo ya esta registrado'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar usuario'
        })
    }
})

// Inicio de sesion
app.post('/login', async (req, resp) => {
    try {
        const { correo, contrasena } = req.body

        if (typeof correo !== 'string' ||
            typeof contrasena !== 'string' ||
            !correo.trim() || !contrasena ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'Credenciales no validas'
            })
        }

        const usuario = await Usuario.findOne({
            where: {
                correo: correo.trim().toLowerCase()
            }
        })

        if (!usuario) {
            return resp.status(401).json({
                mensaje: 'Correo o contrasena incorrectos'
            })
        }

        const valido = await bcrypt.compare(
            contrasena,
            usuario.contrasena
        )

        if (!valido) {
            return resp.status(401).json({
                mensaje: 'Correo o contrasena incorrectos'
            })
        }

        const token = randomBytes(32).toString('hex')

        sesiones.set(token, {
            usuarioId: usuario.id,
            vence: Date.now() + 8 * 60 * 60 * 1000
        })

        resp.status(200).json({
            mensaje: 'Inicio de sesion correcto',
            token: token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol
            }
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al iniciar sesion'
        })
    }
})

// Conexion con la base de datos
sequelize.authenticate()
    .then(async () => {
        console.log('Conexion con BD establecida')

        await sequelize.sync()

        console.log('Tablas sincronizadas correctamente')

        app.listen(Number(process.env.PORT), () => {
            console.log('INMOSPOT ejecutando en el puerto 5000')
        })
    })
    .catch((error) => {
        console.log('Error: ' + error.message)
    })
