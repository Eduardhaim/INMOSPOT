const express = require('express')
const sequelize = require('./db/connection')
const Usuario = require('./Modelos/Usuario')
const Cliente = require('./Modelos/Cliente')
const Propiedad = require('./Modelos/Propiedad')
const Favorito = require('./Modelos/Favorito')
const Solicitud = require('./Modelos/Solicitud')
const Operacion = require('./Modelos/Operacion')
const Contrato = require('./Modelos/Contrato')
const Pago = require('./Modelos/Pago')
const SolicitudActualizacion = require('./Modelos/SolicitudActualizacion')
const bcrypt = require('bcryptjs')
const Fotografia = require('./Modelos/Fotografia')
const { randomBytes } = require('node:crypto')


const app = express()
const sesiones = new Map()

app.use(express.json())


// Limpiar sesiones vencidas
function limpiarSesionesVencidas() {

    const ahora = Date.now()

    for (const [token, sesion] of sesiones) {

        if (sesion.vence <= ahora) {
            sesiones.delete(token)
        }
    }
}


// Ejecutar limpieza cada 15 minutos
setInterval(
    limpiarSesionesVencidas,
    15 * 60 * 1000
).unref()

async function validarSesion(req, resp, next) {
    try {
        const autorizacion = req.headers.authorization

        if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
            return resp.status(401).json({
                mensaje: 'Debe iniciar sesion'
            })
        }

        const token = autorizacion.slice(7)
        const sesion = sesiones.get(token)

        if (!sesion || sesion.vence <= Date.now()) {
            sesiones.delete(token)

            return resp.status(401).json({
                mensaje: 'Sesion no valida o expirada'
            })
        }

        const usuarios = await Usuario.findAll({
            where: { id: sesion.usuarioId },
            attributes: [
                'id',
                'nombre',
                'apellido',
                'correo',
                'rol'
            ]
        })

        const usuario = usuarios[0]

        if (!usuario) {
            sesiones.delete(token)

            return resp.status(401).json({
                mensaje: 'Usuario no encontrado'
            })
        }

        req.usuario = usuario
        req.token = token

        next()

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al validar sesion'
        })
    }
}

function validarRol(...roles) {
    return (req, resp, next) => {
        if (!req.usuario || !roles.includes(req.usuario.rol)) {
            return resp.status(403).json({
                mensaje: 'No tiene permisos para esta operacion'
            })
        }

        next()
    }
}


// Ruta principal
app.get('/', (req, resp) => {
    resp.status(200).json({
        mensaje: 'API INMOSPOT funcionando'
    })
})

// Registro de usuarios
app.post('/registro', async (req, resp) => {
    try {
        const { nombre, apellido, correo, contrasena, rol } = req.body || {}

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

        const existe = await Usuario.findAll({
            where: { correo: correoNormalizado }
        })

        if (existe.length > 0) {
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
        const { correo, contrasena } = req.body || {}

        if (typeof correo !== 'string' ||
            typeof contrasena !== 'string' ||
            !correo.trim() || !contrasena ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'Credenciales no validas'
            })
        }

        const usuarios = await Usuario.findAll({
            where: {
                correo: correo.trim().toLowerCase()
            }
        })

        const usuario = usuarios[0]

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

// Consultar perfil del usuario
app.get('/perfil', validarSesion, async (req, resp) => {
    try {

        resp.status(200).json(req.usuario)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar perfil'
        })
    }
})
// Cerrar sesion
app.post('/logout', validarSesion, async (req, resp) => {
    try {

        sesiones.delete(req.token)

        resp.status(200).json({
            mensaje: 'Sesion cerrada correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al cerrar sesion'
        })
    }
})

// ==========================================
// MODULO DE CLIENTES
// ==========================================


// Consultar cuentas de usuarios
app.get('/usuario', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const usuarios = await Usuario.findAll({
            where: {
                rol: [
                    'comprador',
                    'vendedor',
                    'arrendatario',
                    'propietario'
                ]
            },
            attributes: [
                'id',
                'nombre',
                'apellido',
                'correo',
                'rol'
            ]
        })

        const clientes = await Cliente.findAll({
            attributes: [
                'id',
                'usuarioId'
            ]
        })

        const resultado = []

        for (const usuario of usuarios) {

            const cliente = clientes.find(
                c => c.usuarioId === usuario.id
            )

            resultado.push({
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol,
                clienteId: cliente ? cliente.id : null
            })
        }

        resp.status(200).json(resultado)

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al consultar usuarios'
        })
    }
})


// Validar datos del cliente
function datosClienteValidos(nombre, apellido, telefono, correo, direccion, tipo) {

    const campos = [
        nombre,
        apellido,
        telefono,
        correo
    ]

    if (!campos.every(
        dato => typeof dato === 'string' &&
            dato.trim() &&
            dato.trim().length <= 255
    )) {
        return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
        return false
    }

    if (
        direccion !== undefined &&
        direccion !== null &&
        (
            typeof direccion !== 'string' ||
            direccion.trim().length > 255
        )
    ) {
        return false
    }

    const tipos = [
        'comprador',
        'vendedor',
        'arrendatario',
        'propietario'
    ]

    if (!tipos.includes(tipo)) {
        return false
    }

    return true
}


// Registrar cliente
app.post('/cliente', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const {
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId
        } = req.body || {}

        if (!datosClienteValidos(
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo
        )) {
            return resp.status(400).json({
                mensaje: 'Complete los datos del cliente correctamente'
            })
        }

        if (usuarioId !== undefined && usuarioId !== null) {

            if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Usuario no valido'
                })
            }

            const usuario = await Usuario.findByPk(usuarioId)

            if (!usuario) {
                return resp.status(404).json({
                    mensaje: 'Usuario no encontrado'
                })
            }

            if (usuario.rol !== tipo) {
                return resp.status(400).json({
                    mensaje: 'El rol del usuario no coincide con el tipo de cliente'
                })
            }

            const clienteExistente = await Cliente.findOne({
                where: {
                    usuarioId
                }
            })

            if (clienteExistente) {
                return resp.status(409).json({
                    mensaje: 'El usuario ya tiene un cliente asociado'
                })
            }
        }

        const cliente = await Cliente.create({
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            telefono: telefono.trim(),
            correo: correo.trim().toLowerCase(),
            direccion: direccion ? direccion.trim() : null,
            tipo,
            usuarioId
        })

        resp.status(201).json(cliente)

    } catch (error) {

        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El usuario ya tiene un cliente asociado'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar cliente'
        })
    }
})


// Consultar clientes
app.get('/cliente', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const clientes = await Cliente.findAll()

        resp.status(200).json(clientes)

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al consultar clientes'
        })
    }
})


// Actualizar cliente
app.put('/cliente/:id', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const id = Number(req.params.id)

        const {
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId
        } = req.body || {}

        if (!Number.isInteger(id) || id <= 0) {
            return resp.status(400).json({
                mensaje: 'Identificador no valido'
            })
        }

        if (!datosClienteValidos(
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo
        )) {
            return resp.status(400).json({
                mensaje: 'Complete los datos del cliente correctamente'
            })
        }

        const resultado = await sequelize.transaction(async t => {

            const cliente = await Cliente.findByPk(id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            })

            if (!cliente) {
                return {
                    codigo: 404,
                    datos: {
                        mensaje: 'Cliente no encontrado'
                    }
                }
            }

            // Proteger el tipo del cliente
            if (cliente.tipo !== tipo) {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'No puede cambiar el tipo de un cliente registrado'
                    }
                }
            }

            let usuarioAsociado = cliente.usuarioId

            if (usuarioId !== undefined) {

                if (
                    cliente.usuarioId !== null &&
                    usuarioId !== cliente.usuarioId
                ) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'No puede cambiar la cuenta asociada al cliente'
                        }
                    }
                }

                usuarioAsociado = usuarioId
            }

            if (usuarioAsociado !== null) {

                if (
                    !Number.isInteger(usuarioAsociado) ||
                    usuarioAsociado <= 0
                ) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'Usuario no valido'
                        }
                    }
                }

                const usuario = await Usuario.findByPk(
                    usuarioAsociado,
                    {
                        transaction: t
                    }
                )

                if (!usuario) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Usuario no encontrado'
                        }
                    }
                }

                if (usuario.rol !== tipo) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'El rol del usuario no coincide con el tipo de cliente'
                        }
                    }
                }

                const clienteExistente = await Cliente.findOne({
                    where: {
                        usuarioId: usuarioAsociado
                    },
                    transaction: t
                })

                if (
                    clienteExistente &&
                    clienteExistente.id !== cliente.id
                ) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'El usuario ya tiene un cliente asociado'
                        }
                    }
                }
            }

            await Cliente.update({
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                telefono: telefono.trim(),
                correo: correo.trim().toLowerCase(),
                direccion: direccion === undefined
                    ? cliente.direccion
                    : direccion ? direccion.trim() : null,
                tipo,
                usuarioId: usuarioAsociado
            }, {
                where: {
                    id
                },
                transaction: t
            })

            return {
                codigo: 200,
                datos: {
                    mensaje: 'Cliente actualizado correctamente'
                }
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {

        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El usuario ya tiene un cliente asociado'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al actualizar cliente'
        })
    }
})


// Consultar bienes inmuebles de un cliente
app.get('/cliente/:id/propiedades', validarSesion, validarRol('agente', 'vendedor', 'propietario'), async (req, resp) => {
    try {

        const id = req.params.id

        const cliente = await Cliente.findByPk(id)

        if (!cliente) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        if (
            req.usuario.rol !== 'agente' &&
            cliente.usuarioId !== req.usuario.id
        ) {
            return resp.status(403).json({
                mensaje: 'No tiene permisos'
            })
        }

        const propiedades = await Propiedad.findAll({
            where: {
                clienteId: id
            }
        })

        resp.status(200).json({
            clienteId: cliente.id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            totalBienes: propiedades.length,
            propiedades
        })

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al consultar bienes del cliente'
        })
    }
})


// Eliminar cliente
app.delete('/cliente/:id', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const id = req.params.id

        const eliminado = await Cliente.destroy({
            where: {
                id
            }
        })

        if (eliminado === 0) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        resp.status(200).json({
            mensaje: 'Cliente eliminado correctamente'
        })

    } catch (error) {

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return resp.status(409).json({
                mensaje: 'El cliente tiene registros relacionados'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al eliminar cliente'
        })
    }
})

// Registrar propiedad
app.post('/propiedad', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {

        const {
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId
        } = req.body || {}

        if (![titulo, descripcion, ubicacion, zona].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Complete los campos obligatorios'
            })
        }

        const tipos = [
            'casa',
            'apartamento',
            'terreno',
            'local'
        ]

        if (!tipos.includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de propiedad no valido'
            })
        }

        if (!['venta', 'alquiler'].includes(finalidad)) {
            return resp.status(400).json({
                mensaje: 'Finalidad no valida'
            })
        }

        if (
            typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio < 0.01 ||
            precio > 9999999999.99 ||
            !/^\d+(\.\d{1,2})?$/.test(String(precio))
        ) {
            return resp.status(400).json({
                mensaje: 'Precio no valido'
            })
        }

        if (
            titulo.trim().length > 255 ||
            ubicacion.trim().length > 255 ||
            zona.trim().length > 255
        ) {
            return resp.status(400).json({
                mensaje: 'Los campos superan la longitud permitida'
            })
        }

        if (
            caracteristicas !== undefined &&
            caracteristicas !== null &&
            typeof caracteristicas !== 'string'
        ) {
            return resp.status(400).json({
                mensaje: 'Caracteristicas no validas'
            })
        }

        let cliente

        if (req.usuario.rol === 'agente') {

            if (!Number.isInteger(clienteId) || clienteId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Debe seleccionar un cliente'
                })
            }

            cliente = await Cliente.findByPk(clienteId)

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Cliente no encontrado'
                })
            }

        } else {

            cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(400).json({
                    mensaje: 'El usuario no tiene un cliente asociado'
                })
            }

            if (clienteId !== undefined && clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No puede registrar propiedades de otro cliente'
                })
            }
        }

        if (!['propietario', 'vendedor'].includes(cliente.tipo)) {
            return resp.status(400).json({
                mensaje: 'El cliente debe ser propietario o vendedor'
            })
        }

        const propiedad = await Propiedad.create({
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            tipo,
            finalidad,
            precio,
            ubicacion: ubicacion.trim(),
            zona: zona.trim(),
            caracteristicas,
            estado: 'disponible',
            usuarioId: req.usuario.id,
            clienteId: cliente.id
        })

        resp.status(201).json(propiedad)

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al registrar propiedad'
        })
    }
})


// Consultar propiedades
app.get('/propiedad', validarSesion, async (req, resp) => {
    try {

        let condiciones = {}

        if (req.usuario.rol === 'comprador') {

            condiciones = {
                estado: 'disponible',
                finalidad: 'venta'
            }
        }

        if (req.usuario.rol === 'arrendatario') {

            condiciones = {
                estado: 'disponible',
                finalidad: 'alquiler'
            }
        }

        if (['vendedor', 'propietario'].includes(req.usuario.rol)) {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(200).json([])
            }

            condiciones = {
                clienteId: cliente.id
            }
        }

        const propiedades = await Propiedad.findAll({
            where: condiciones
        })

        resp.status(200).json(propiedades)

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al consultar propiedades'
        })
    }
})


// Actualizar propiedad
app.put('/propiedad/:id', validarSesion, validarRol('agente', 'vendedor', 'propietario'), async (req, resp) => {
    try {

        const {
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId
        } = req.body || {}

        if (![titulo, descripcion, ubicacion, zona].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Debe completar los campos obligatorios'
            })
        }

        if (!['casa', 'apartamento', 'terreno', 'local'].includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de propiedad no valido'
            })
        }

        if (!['venta', 'alquiler'].includes(finalidad)) {
            return resp.status(400).json({
                mensaje: 'Finalidad no valida'
            })
        }

        if (
            typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio < 0.01 ||
            precio > 9999999999.99 ||
            !/^\d+(\.\d{1,2})?$/.test(String(precio))
        ) {
            return resp.status(400).json({
                mensaje: 'Precio no valido'
            })
        }

        if (
            titulo.trim().length > 255 ||
            ubicacion.trim().length > 255 ||
            zona.trim().length > 255
        ) {
            return resp.status(400).json({
                mensaje: 'Los campos superan la longitud permitida'
            })
        }

        if (
            caracteristicas !== undefined &&
            caracteristicas !== null &&
            typeof caracteristicas !== 'string'
        ) {
            return resp.status(400).json({
                mensaje: 'Caracteristicas no validas'
            })
        }

        const resultado = await sequelize.transaction(async t => {

            const propiedad = await Propiedad.findByPk(
                req.params.id,
                {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                }
            )

            if (!propiedad) {
                return {
                    codigo: 404,
                    datos: {
                        mensaje: 'Propiedad no encontrada'
                    }
                }
            }

            let cliente

            if (req.usuario.rol === 'agente') {

                const idCliente = clienteId === undefined
                    ? propiedad.clienteId
                    : clienteId

                if (!Number.isInteger(idCliente) || idCliente <= 0) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'Cliente no valido'
                        }
                    }
                }

                cliente = await Cliente.findByPk(idCliente, {
                    transaction: t
                })

                if (!cliente) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Cliente no encontrado'
                        }
                    }
                }

            } else {

                cliente = await Cliente.findOne({
                    where: {
                        usuarioId: req.usuario.id
                    },
                    transaction: t
                })

                if (!cliente || propiedad.clienteId !== cliente.id) {
                    return {
                        codigo: 403,
                        datos: {
                            mensaje: 'No tiene permisos para modificar esta propiedad'
                        }
                    }
                }

                if (clienteId !== undefined && clienteId !== cliente.id) {
                    return {
                        codigo: 403,
                        datos: {
                            mensaje: 'No puede cambiar el propietario'
                        }
                    }
                }
            }

            if (!['propietario', 'vendedor'].includes(cliente.tipo)) {
                return {
                    codigo: 400,
                    datos: {
                        mensaje: 'El cliente debe ser propietario o vendedor'
                    }
                }
            }

            if (propiedad.estado !== 'disponible') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'Solamente se pueden modificar propiedades disponibles'
                    }
                }
            }

            // Proteger el historial al cambiar de propietario
            if (propiedad.clienteId !== cliente.id) {

                const operacion = await Operacion.findOne({
                    where: {
                        propiedadId: propiedad.id
                    },
                    transaction: t
                })

                const solicitud = await Solicitud.findOne({
                    where: {
                        propiedadId: propiedad.id
                    },
                    transaction: t
                })

                const solicitudActualizacion =
                    await SolicitudActualizacion.findOne({
                        where: {
                            propiedadId: propiedad.id
                        },
                        transaction: t
                    })

                if (
                    operacion ||
                    solicitud ||
                    solicitudActualizacion
                ) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'No puede cambiar el propietario de un inmueble con historial'
                        }
                    }
                }
            }

            await Propiedad.update({
                titulo: titulo.trim(),
                descripcion: descripcion.trim(),
                tipo,
                finalidad,
                precio,
                ubicacion: ubicacion.trim(),
                zona: zona.trim(),
                caracteristicas,
                clienteId: cliente.id
            }, {
                where: {
                    id: propiedad.id
                },
                transaction: t
            })

            return {
                codigo: 200,
                datos: {
                    mensaje: 'Propiedad actualizada correctamente'
                }
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {

        resp.status(500).json({
            mensaje: 'Error al actualizar propiedad'
        })
    }
})
// Actualizar propiedad
app.put('/propiedad/:id', validarSesion, validarRol('agente', 'vendedor', 'propietario'), async (req, resp) => {
    try {
        const {
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId
        } = req.body || {}

        const propiedad = await Propiedad.findByPk(req.params.id)

        if (!propiedad) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        let cliente

        if (req.usuario.rol === 'agente') {

            const idCliente = clienteId === undefined
                ? propiedad.clienteId
                : clienteId

            if (!Number.isInteger(idCliente) || idCliente <= 0) {
                return resp.status(400).json({
                    mensaje: 'Cliente no valido'
                })
            }

            cliente = await Cliente.findByPk(idCliente)

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Cliente no encontrado'
                })
            }

        } else {

            cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente || propiedad.clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos para modificar esta propiedad'
                })
            }

            if (clienteId !== undefined && clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No puede cambiar el propietario'
                })
            }
        }

        if (propiedad.estado !== 'disponible') {
            return resp.status(409).json({
                mensaje: 'Solamente se pueden modificar propiedades disponibles'
            })
        }

        if (
            typeof titulo !== 'string' || !titulo.trim() ||
            typeof descripcion !== 'string' || !descripcion.trim() ||
            typeof ubicacion !== 'string' || !ubicacion.trim() ||
            typeof zona !== 'string' || !zona.trim()
        ) {
            return resp.status(400).json({
                mensaje: 'Debe completar los campos obligatorios'
            })
        }

        if (!['casa', 'apartamento', 'terreno', 'local'].includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de propiedad no valido'
            })
        }

        if (!['venta', 'alquiler'].includes(finalidad)) {
            return resp.status(400).json({
                mensaje: 'Finalidad no valida'
            })
        }

        if (
            typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio <= 0 ||
            precio > 9999999999.99
        ) {
            return resp.status(400).json({
                mensaje: 'Precio no valido'
            })
        }

        const condiciones = {
            id: propiedad.id,
            estado: 'disponible'
        }

        if (req.usuario.rol !== 'agente') {
            condiciones.clienteId = cliente.id
        }

        const [actualizado] = await Propiedad.update({
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            tipo: tipo,
            finalidad: finalidad,
            precio: precio,
            ubicacion: ubicacion.trim(),
            zona: zona.trim(),
            caracteristicas: caracteristicas,
            clienteId: cliente.id
        }, {
            where: condiciones
        })

        if (actualizado === 0) {
            return resp.status(409).json({
                mensaje: 'No se pudo actualizar la propiedad'
            })
        }

        resp.status(200).json({
            mensaje: 'Propiedad actualizada correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al actualizar propiedad'
        })
    }
})


// Actualizar estado de una propiedad
app.put('/propiedad/:id/estado',
    validarSesion,
    validarRol('agente'),
    async (req, resp) => {

        try {

            const id = Number(req.params.id)
            const { estado } = req.body || {}

            if (!Number.isInteger(id) || id <= 0) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            const estados = [
                'disponible',
                'reservada',
                'alquilada',
                'vendida'
            ]

            if (!estados.includes(estado)) {
                return resp.status(400).json({
                    mensaje: 'Estado no valido'
                })
            }

            const resultado = await sequelize.transaction(async t => {

                const propiedad = await Propiedad.findByPk(
                    id,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                if (!propiedad) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Propiedad no encontrada'
                        }
                    }
                }

                const operaciones = await Operacion.findAll({
                    where: {
                        propiedadId: propiedad.id
                    },
                    transaction: t
                })

                for (const operacion of operaciones) {

                    let bloquear = false

                    if (operacion.estado === 'pendiente') {
                        bloquear = true
                    }

                    if (
                        operacion.estado === 'finalizada' &&
                        operacion.tipo === 'venta'
                    ) {
                        bloquear = true
                    }

                    if (
                        operacion.estado === 'finalizada' &&
                        operacion.tipo === 'alquiler'
                    ) {

                        const contrato = await Contrato.findOne({
                            where: {
                                operacionId: operacion.id,
                                estado: 'vigente'
                            },
                            transaction: t
                        })

                        if (contrato) {
                            bloquear = true
                        }
                    }

                    if (bloquear) {
                        return {
                            codigo: 409,
                            datos: {
                                mensaje: 'El estado debe gestionarse desde el modulo de operaciones y contratos'
                            }
                        }
                    }
                }

                // Impedir ventas y alquileres sin contrato
                if (
                    estado === 'vendida' ||
                    estado === 'alquilada'
                ) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'Debe registrar la operacion y el contrato correspondiente'
                        }
                    }
                }

                await Propiedad.update({
                    estado
                }, {
                    where: {
                        id: propiedad.id
                    },
                    transaction: t
                })

                return {
                    codigo: 200,
                    datos: {
                        mensaje: 'Estado actualizado correctamente'
                    }
                }
            })

            resp.status(resultado.codigo).json(resultado.datos)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al actualizar estado'
            })
        }
    }
)


// Eliminar propiedad
app.delete('/propiedad/:id',
    validarSesion,
    validarRol('vendedor', 'propietario', 'agente'),
    async (req, resp) => {

        try {

            const id = Number(req.params.id)

            if (!Number.isInteger(id) || id <= 0) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            const resultado = await sequelize.transaction(async t => {

                const propiedad = await Propiedad.findByPk(
                    id,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                if (!propiedad) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Propiedad no encontrada'
                        }
                    }
                }

                if (req.usuario.rol !== 'agente') {

                    const cliente = await Cliente.findOne({
                        where: {
                            usuarioId: req.usuario.id
                        },
                        transaction: t
                    })

                    if (
                        !cliente ||
                        propiedad.clienteId !== cliente.id
                    ) {
                        return {
                            codigo: 403,
                            datos: {
                                mensaje: 'No tiene permisos para eliminar esta propiedad'
                            }
                        }
                    }
                }

                if (propiedad.estado !== 'disponible') {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'La propiedad no esta disponible para eliminar'
                        }
                    }
                }

                const eliminado = await Propiedad.destroy({
                    where: {
                        id: propiedad.id
                    },
                    transaction: t
                })

                if (eliminado === 0) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Propiedad no encontrada'
                        }
                    }
                }

                return {
                    codigo: 200,
                    datos: {
                        mensaje: 'Propiedad eliminada correctamente'
                    }
                }
            })

            resp.status(resultado.codigo).json(resultado.datos)

        } catch (error) {

            if (error.name === 'SequelizeForeignKeyConstraintError') {
                return resp.status(409).json({
                    mensaje: 'La propiedad tiene registros relacionados'
                })
            }

            resp.status(500).json({
                mensaje: 'Error al eliminar propiedad'
            })
        }
    }
)


// Consultar detalle de propiedad
app.get('/propiedad/:id', validarSesion, async (req, resp) => {
    try {

        let condiciones = {
            id: req.params.id
        }

        if (req.usuario.rol === 'comprador') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'venta'
        }

        if (req.usuario.rol === 'arrendatario') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'alquiler'
        }

        if (req.usuario.rol === 'vendedor' ||
            req.usuario.rol === 'propietario') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            condiciones.clienteId = cliente.id
        }

        const propiedad = await Propiedad.findAll({
            where: condiciones
        })

        if (propiedad.length > 0) {
            resp.status(200).json(propiedad[0])
        }
        else {
            resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar propiedad'
        })
    }
})

// Buscar propiedades por tipo y zona
app.get('/propiedad/buscar/:tipo/:zona', validarSesion, async (req, resp) => {
    try {
        const { tipo, zona } = req.params
        const { precioMin, precioMax } = req.query

        const condiciones = {}

        // Validar precios
        if (
            precioMin !== undefined &&
            (
                typeof precioMin !== 'string' ||
                !/^\d+(\.\d{1,2})?$/.test(precioMin) ||
                Number(precioMin) > 9999999999.99
            )
        ) {
            return resp.status(400).json({
                mensaje: 'Precio minimo no valido'
            })
        }

        if (
            precioMax !== undefined &&
            (
                typeof precioMax !== 'string' ||
                !/^\d+(\.\d{1,2})?$/.test(precioMax) ||
                Number(precioMax) > 9999999999.99
            )
        ) {
            return resp.status(400).json({
                mensaje: 'Precio maximo no valido'
            })
        }

        if (
            precioMin !== undefined &&
            precioMax !== undefined &&
            Number(precioMin) > Number(precioMax)
        ) {
            return resp.status(400).json({
                mensaje: 'El precio minimo no puede superar al maximo'
            })
        }

        // Permisos segun el rol
        if (req.usuario.rol === 'comprador') {

            condiciones.finalidad = 'venta'
            condiciones.estado = 'disponible'

        } else if (req.usuario.rol === 'arrendatario') {

            condiciones.finalidad = 'alquiler'
            condiciones.estado = 'disponible'

        } else if (
            req.usuario.rol === 'propietario' ||
            req.usuario.rol === 'vendedor'
        ) {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(200).json([])
            }

            condiciones.clienteId = cliente.id

        } else if (req.usuario.rol !== 'agente') {

            return resp.status(403).json({
                mensaje: 'No tiene permisos'
            })
        }

        // Filtrar por tipo
        if (tipo !== 'todos') {
            condiciones.tipo = tipo
        }

        // Filtrar por zona
        if (zona !== 'todas') {
            condiciones.zona = zona
        }

        const propiedades = await Propiedad.findAll({
            where: condiciones
        })

        const resultado = []

        // Filtrar por precio
        for (const propiedad of propiedades) {

            const precio = Number(propiedad.precio)

            if (
                precioMin !== undefined &&
                precio < Number(precioMin)
            ) {
                continue
            }

            if (
                precioMax !== undefined &&
                precio > Number(precioMax)
            ) {
                continue
            }

            resultado.push(propiedad)
        }

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al buscar propiedades'
        })
    }
})

// ==========================================
// MODULO DE FOTOGRAFIAS
// ==========================================

const multer = require('multer')
const fs = require('node:fs')
const path = require('node:path')


// Crear carpeta de almacenamiento
const carpetaFotos = path.join(__dirname, 'uploads')

fs.mkdirSync(carpetaFotos, { recursive: true })


// Configurar Multer
const subirImagen = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 1,
        fieldSize: 100,
        fieldNameSize: 50,
        parts: 3
    },

    fileFilter: (req, archivo, callback) => {

        const formatos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ]

        if (!formatos.includes(archivo.mimetype)) {
            return callback(
                new Error('Solo se permiten imagenes JPG, PNG y WEBP')
            )
        }

        callback(null, true)
    }

}).single('imagen')


// Recibir imagen y controlar errores
function recibirImagen(req, resp, next) {

    if (!req.is('multipart/form-data')) {
        return resp.status(400).json({
            mensaje: 'Debe enviar un formulario multipart/form-data'
        })
    }

    subirImagen(req, resp, error => {

        if (error) {

            const estado = error.code === 'LIMIT_FILE_SIZE'
                ? 413
                : 400

            return resp.status(estado).json({
                mensaje: error.message
            })
        }

        next()
    })
}


// Validar identificadores
function idFotografiaValido(id) {

    if (
        typeof id !== 'string' &&
        typeof id !== 'number'
    ) {
        return false
    }

    return /^\d+$/.test(String(id)) &&
        Number.isInteger(Number(id)) &&
        Number(id) > 0 &&
        Number(id) <= 2147483647
}


// Comprobar formato del archivo
function extensionImagen(archivo) {

    if (!archivo || !Buffer.isBuffer(archivo.buffer)) {
        return null
    }

    const datos = archivo.buffer

    if (
        archivo.mimetype === 'image/jpeg' &&
        datos.length >= 3 &&
        datos[0] === 255 &&
        datos[1] === 216 &&
        datos[2] === 255
    ) {
        return '.jpg'
    }

    if (
        archivo.mimetype === 'image/png' &&
        datos.length >= 8 &&
        datos.subarray(0, 8).toString('hex') ===
        '89504e470d0a1a0a'
    ) {
        return '.png'
    }

    if (
        archivo.mimetype === 'image/webp' &&
        datos.length >= 12 &&
        datos.toString('ascii', 0, 4) === 'RIFF' &&
        datos.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return '.webp'
    }

    return null
}


// Verificar permisos sobre una propiedad
async function permisoFotografia(usuario, propiedad, editar) {

    if (usuario.rol === 'agente') {
        return true
    }

    if (
        usuario.rol === 'propietario' ||
        usuario.rol === 'vendedor'
    ) {

        const cliente = await Cliente.findOne({
            where: {
                usuarioId: usuario.id
            }
        })

        return cliente !== null &&
            propiedad.clienteId === cliente.id
    }

    if (editar) {
        return false
    }

    if (usuario.rol === 'comprador') {

        return propiedad.finalidad === 'venta' &&
            propiedad.estado === 'disponible'
    }

    if (usuario.rol === 'arrendatario') {

        return propiedad.finalidad === 'alquiler' &&
            propiedad.estado === 'disponible'
    }

    return false
}


// Eliminar archivo local
async function eliminarArchivoFoto(ruta) {

    try {

        await fs.promises.unlink(ruta)

    } catch (error) {

        if (error.code !== 'ENOENT') {
            console.log('Error al eliminar archivo:', error.message)
        }
    }
}


// Registrar fotografia mediante URL
app.post('/fotografia',
    validarSesion,
    validarRol('agente', 'propietario', 'vendedor'),
    async (req, resp) => {

        try {

            const { url, propiedadId } = req.body || {}

            if (
                typeof url !== 'string' ||
                !url.trim() ||
                url.trim().length > 255 ||
                !Number.isInteger(propiedadId) ||
                !idFotografiaValido(propiedadId)
            ) {
                return resp.status(400).json({
                    mensaje: 'Datos de fotografia incorrectos'
                })
            }

            try {

                const direccion = new URL(url.trim())

                if (
                    direccion.protocol !== 'http:' &&
                    direccion.protocol !== 'https:'
                ) {
                    throw new Error('URL incorrecta')
                }

            } catch (error) {

                return resp.status(400).json({
                    mensaje: 'La URL debe ser HTTP o HTTPS'
                })
            }

            const propiedad = await Propiedad.findByPk(
                propiedadId
            )

            if (!propiedad) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            if (!await permisoFotografia(req.usuario, propiedad, true)) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos sobre esta propiedad'
                })
            }

            const fotografia = await Fotografia.create({
                url: url.trim(),
                propiedadId
            })

            resp.status(201).json({
                mensaje: 'Fotografia registrada correctamente',
                fotografia
            })

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al registrar fotografia'
            })
        }
    }
)


// Subir fotografia real
app.post('/fotografia/subir',
    validarSesion,
    validarRol('agente', 'propietario', 'vendedor'),
    recibirImagen,
    async (req, resp) => {

        let rutaArchivo = null

        try {

            const { propiedadId } = req.body || {}

            if (!idFotografiaValido(propiedadId)) {
                return resp.status(400).json({
                    mensaje: 'Propiedad incorrecta'
                })
            }

            if (!req.file) {
                return resp.status(400).json({
                    mensaje: 'Debe seleccionar una imagen'
                })
            }

            const extension = extensionImagen(req.file)

            if (!extension) {
                return resp.status(400).json({
                    mensaje: 'El archivo no tiene un formato valido'
                })
            }

            const propiedad = await Propiedad.findByPk(
                Number(propiedadId)
            )

            if (!propiedad) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            if (!await permisoFotografia(req.usuario, propiedad, true)) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos sobre esta propiedad'
                })
            }

            const nombreArchivo =
                randomBytes(16).toString('hex') + extension

            rutaArchivo = path.join(
                carpetaFotos,
                nombreArchivo
            )

            await fs.promises.writeFile(
                rutaArchivo,
                req.file.buffer
            )

            const fotografia = await Fotografia.create({
                url: '/fotografia/archivo/' + nombreArchivo,
                propiedadId: Number(propiedadId)
            })

            rutaArchivo = null

            resp.status(201).json({
                mensaje: 'Imagen subida correctamente',
                fotografia
            })

        } catch (error) {

            if (rutaArchivo) {
                await eliminarArchivoFoto(rutaArchivo)
            }

            resp.status(500).json({
                mensaje: 'Error al subir fotografia'
            })
        }
    }
)


// Visualizar archivo de imagen
app.get('/fotografia/archivo/:nombre',
    validarSesion,
    async (req, resp, next) => {

        try {

            const { nombre } = req.params

            if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(nombre)) {
                return resp.status(400).json({
                    mensaje: 'Nombre de archivo incorrecto'
                })
            }

            const fotografia = await Fotografia.findOne({
                where: {
                    url: '/fotografia/archivo/' + nombre
                }
            })

            if (!fotografia) {
                return resp.status(404).json({
                    mensaje: 'Fotografia no encontrada'
                })
            }

            const propiedad = await Propiedad.findByPk(
                fotografia.propiedadId
            )

            if (
                !propiedad ||
                !await permisoFotografia(req.usuario, propiedad, false)
            ) {
                return resp.status(404).json({
                    mensaje: 'Fotografia no disponible'
                })
            }

            const ruta = path.join(carpetaFotos, nombre)

            resp.setHeader(
                'Cache-Control',
                'private, no-store'
            )

            resp.setHeader(
                'X-Content-Type-Options',
                'nosniff'
            )

            resp.sendFile(ruta, error => {

                if (error) {

                    if (resp.headersSent) {
                        return next(error)
                    }

                    const estado = error.status === 404 ||
                        error.code === 'ENOENT' ? 404 : 500

                    resp.status(estado).json({
                        mensaje: 'No se pudo obtener la imagen'
                    })
                }
            })

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al visualizar fotografia'
            })
        }
    }
)


// Consultar fotografias de una propiedad
app.get('/fotografia/:propiedadId',
    validarSesion,
    async (req, resp) => {

        try {

            const { propiedadId } = req.params

            if (!idFotografiaValido(propiedadId)) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            const propiedad = await Propiedad.findByPk(
                Number(propiedadId)
            )

            if (
                !propiedad ||
                !await permisoFotografia(req.usuario, propiedad, false)
            ) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            const fotografias = await Fotografia.findAll({
                where: {
                    propiedadId: propiedad.id
                }
            })

            resp.status(200).json(fotografias)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al consultar fotografias'
            })
        }
    }
)


// Eliminar fotografia
app.delete('/fotografia/:id',
    validarSesion,
    validarRol('agente', 'propietario', 'vendedor'),
    async (req, resp) => {

        try {

            const { id } = req.params

            if (!idFotografiaValido(id)) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            const fotografia = await Fotografia.findByPk(
                Number(id)
            )

            if (!fotografia) {
                return resp.status(404).json({
                    mensaje: 'Fotografia no encontrada'
                })
            }

            const propiedad = await Propiedad.findByPk(
                fotografia.propiedadId
            )

            if (!propiedad) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            if (!await permisoFotografia(req.usuario, propiedad, true)) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos sobre esta propiedad'
                })
            }

            const url = fotografia.url

            const eliminadas = await Fotografia.destroy({
                where: {
                    id: fotografia.id
                }
            })

            if (eliminadas === 0) {
                return resp.status(404).json({
                    mensaje: 'Fotografia no encontrada'
                })
            }

            const coincidencia = url.match(
                /^\/fotografia\/archivo\/([a-f0-9]{32}\.(jpg|png|webp))$/
            )

            if (coincidencia) {

                const ruta = path.join(
                    carpetaFotos,
                    coincidencia[1]
                )

                await eliminarArchivoFoto(ruta)
            }

            resp.status(200).json({
                mensaje: 'Fotografia eliminada correctamente'
            })

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al eliminar fotografia'
            })
        }
    }
)

// Registrar favorito
app.post('/favorito', validarSesion, validarRol('comprador'), async (req, resp) => {
    try {
        const { propiedadId } = req.body || {}

        if (!Number.isInteger(propiedadId) || propiedadId <= 0) {
            return resp.status(400).json({
                mensaje: 'Debe proporcionar una propiedad valida'
            })
        }

        const propiedad = await Propiedad.findOne({
            where: {
                id: propiedadId,
                estado: 'disponible',
                finalidad: 'venta'
            }
        })

        if (!propiedad) {
            return resp.status(404).json({
                mensaje: 'Propiedad no disponible'
            })
        }

        const favoritoExistente = await Favorito.findOne({
            where: {
                usuarioId: req.usuario.id,
                propiedadId: propiedadId
            }
        })

        if (favoritoExistente) {
            return resp.status(409).json({
                mensaje: 'La propiedad ya esta en favoritos'
            })
        }

        const favorito = await Favorito.create({
            usuarioId: req.usuario.id,
            propiedadId: propiedadId
        })

        resp.status(201).json(favorito)

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'La propiedad ya esta en favoritos'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar favorito'
        })
    }
})

// Consultar mis favoritos
app.get('/favorito', validarSesion, validarRol('comprador'), async (req, resp) => {
    try {
        const favoritos = await Favorito.findAll({
            where: {
                usuarioId: req.usuario.id
            }
        })

        const resultado = []

        for (const favorito of favoritos) {
            const propiedad = await Propiedad.findOne({
                where: {
                    id: favorito.propiedadId,
                    estado: 'disponible',
                    finalidad: 'venta'
                }
            })

            resultado.push({
                id: favorito.id,
                propiedadId: favorito.propiedadId,
                propiedad: propiedad
            })
        }

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar favoritos'
        })
    }
})

// Eliminar favorito
app.delete('/favorito/:id', validarSesion, validarRol('comprador'), async (req, resp) => {
    try {
        const eliminado = await Favorito.destroy({
            where: {
                id: req.params.id,
                usuarioId: req.usuario.id
            }
        })

        if (eliminado === 0) {
            return resp.status(404).json({
                mensaje: 'Favorito no encontrado'
            })
        }

        resp.status(200).json({
            mensaje: 'Favorito eliminado correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al eliminar favorito'
        })
    }
})

// Registrar solicitud
app.post('/solicitud',
    validarSesion,
    validarRol('comprador', 'arrendatario'),
    async (req, resp) => {

        try {

            const { propiedadId, mensaje } = req.body || {}

            if (!Number.isInteger(propiedadId) || propiedadId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Debe proporcionar una propiedad valida'
                })
            }

            if (
                typeof mensaje !== 'string' ||
                !mensaje.trim() ||
                mensaje.length > 1000
            ) {
                return resp.status(400).json({
                    mensaje: 'Debe proporcionar un mensaje valido'
                })
            }

            let finalidad = 'venta'

            if (req.usuario.rol === 'arrendatario') {
                finalidad = 'alquiler'
            }

            const resultado = await sequelize.transaction(async t => {

                const propiedad = await Propiedad.findByPk(
                    propiedadId,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                if (
                    !propiedad ||
                    propiedad.estado !== 'disponible' ||
                    propiedad.finalidad !== finalidad
                ) {
                    return {
                        codigo: 404,
                        datos: {
                            mensaje: 'Propiedad no disponible'
                        }
                    }
                }

                const solicitudes = await Solicitud.findAll({
                    where: {
                        usuarioId: req.usuario.id,
                        propiedadId,
                        estado: ['pendiente', 'aceptada']
                    },
                    transaction: t
                })

                for (const solicitud of solicitudes) {

                    if (solicitud.estado === 'aceptada') {

                        const operacion = await Operacion.findOne({
                            where: {
                                solicitudId: solicitud.id,
                                tipo: 'alquiler',
                                estado: 'finalizada'
                            },
                            transaction: t
                        })

                        if (operacion) {

                            const contrato = await Contrato.findOne({
                                where: {
                                    operacionId: operacion.id,
                                    estado: 'finalizado'
                                },
                                transaction: t
                            })

                            if (contrato) {
                                continue
                            }
                        }
                    }

                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'Ya tiene una solicitud activa para esta propiedad'
                        }
                    }
                }

                const solicitud = await Solicitud.create({
                    usuarioId: req.usuario.id,
                    propiedadId,
                    mensaje: mensaje.trim(),
                    estado: 'pendiente'
                }, {
                    transaction: t
                })

                return {
                    codigo: 201,
                    datos: solicitud
                }
            })

            resp.status(resultado.codigo).json(resultado.datos)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al registrar solicitud'
            })
        }
    }
)
// Determinar solicitudes permitidas
async function condicionesSolicitud(usuario) {

    if (usuario.rol === 'agente') {
        return {}
    }

    if (['comprador', 'arrendatario'].includes(usuario.rol)) {
        return {
            usuarioId: usuario.id
        }
    }

    if (['vendedor', 'propietario'].includes(usuario.rol)) {

        const cliente = await Cliente.findOne({
            where: {
                usuarioId: usuario.id
            }
        })

        if (!cliente) {
            return null
        }

        const propiedades = await Propiedad.findAll({
            where: {
                clienteId: cliente.id
            }
        })

        if (propiedades.length === 0) {
            return null
        }

        const ids = []

        for (const propiedad of propiedades) {
            ids.push(propiedad.id)
        }

        return {
            propiedadId: ids
        }
    }

    return null
}
// Obtener informacion de una solicitud
async function informacionSolicitud(solicitud) {

    const usuario = await Usuario.findByPk(
        solicitud.usuarioId,
        {
            attributes: ['id', 'nombre', 'apellido']
        }
    )

    const propiedad = await Propiedad.findByPk(
        solicitud.propiedadId,
        {
            attributes: ['id', 'titulo', 'precio', 'finalidad', 'estado']
        }
    )

    return {
        id: solicitud.id,
        usuarioId: solicitud.usuarioId,
        propiedadId: solicitud.propiedadId,
        mensaje: solicitud.mensaje,
        fecha: solicitud.fecha,
        estado: solicitud.estado,
        usuario: usuario,
        propiedad: propiedad
    }
}
// Consultar solicitudes
app.get('/solicitud', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesSolicitud(req.usuario)

        if (condiciones === null) {
            return resp.status(200).json([])
        }

        const solicitudes = await Solicitud.findAll({
            where: condiciones
        })

        const resultado = []

        for (const solicitud of solicitudes) {
            resultado.push(await informacionSolicitud(solicitud))
        }

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar solicitudes'
        })
    }
})


// Consultar una solicitud por ID
app.get('/solicitud/:id', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesSolicitud(req.usuario)

        if (condiciones === null) {
            return resp.status(404).json({
                mensaje: 'Solicitud no encontrada'
            })
        }

        condiciones.id = req.params.id

        const solicitud = await Solicitud.findOne({
            where: condiciones
        })

        if (!solicitud) {
            return resp.status(404).json({
                mensaje: 'Solicitud no encontrada'
            })
        }

        const resultado = await informacionSolicitud(solicitud)

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar solicitud'
        })
    }
})
// Cambiar estado de solicitud
app.put('/solicitud/:id/estado', validarSesion, validarRol('agente', 'comprador', 'arrendatario'), async (req, resp) => {
    try {
        const { estado } = req.body || {}

        if (!['aceptada', 'rechazada', 'cancelada'].includes(estado)) {
            return resp.status(400).json({
                mensaje: 'Estado no valido'
            })
        }

        const solicitud = await Solicitud.findByPk(req.params.id)

        if (!solicitud) {
            return resp.status(404).json({
                mensaje: 'Solicitud no encontrada'
            })
        }

        if (req.usuario.rol === 'agente') {

            if (!['aceptada', 'rechazada'].includes(estado)) {
                return resp.status(403).json({
                    mensaje: 'El agente solamente puede aceptar o rechazar solicitudes'
                })
            }

        } else {

            if (solicitud.usuarioId !== req.usuario.id || estado !== 'cancelada') {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos para esta operacion'
                })
            }
        }

        if (solicitud.estado !== 'pendiente') {
            return resp.status(409).json({
                mensaje: 'La solicitud ya fue gestionada'
            })
        }

        if (estado === 'aceptada') {

            const propiedad = await Propiedad.findByPk(solicitud.propiedadId)

            if (!propiedad || propiedad.estado !== 'disponible') {
                return resp.status(409).json({
                    mensaje: 'La propiedad ya no esta disponible'
                })
            }
        }

        const [actualizado] = await Solicitud.update({
            estado: estado
        }, {
            where: {
                id: solicitud.id,
                estado: 'pendiente'
            }
        })

        if (actualizado === 0) {
            return resp.status(409).json({
                mensaje: 'La solicitud ya fue gestionada'
            })
        }

        resp.status(200).json({
            mensaje: 'Estado de solicitud actualizado correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al actualizar solicitud'
        })
    }
})
// ==================================================
// MODULO DE OPERACIONES DE VENTA Y ALQUILER
// ==================================================


// Registrar operacion
app.post('/operacion', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const { solicitudId, monto } = req.body || {}

        if (
            !Number.isInteger(solicitudId) ||
            solicitudId <= 0
        ) {
            return resp.status(400).json({
                mensaje: 'Solicitud no valida'
            })
        }

        // Validar monto con un maximo de dos decimales
        if (
            typeof monto !== 'number' ||
            !Number.isFinite(monto) ||
            monto < 0.01 ||
            monto > 9999999999.99 ||
            !/^\d+(\.\d{1,2})?$/.test(String(monto))
        ) {
            return resp.status(400).json({
                mensaje: 'Monto no valido'
            })
        }

        const resultado = await sequelize.transaction(async t => {

            const solicitudInicial = await Solicitud.findByPk(
                solicitudId,
                {
                    transaction: t
                }
            )

            if (!solicitudInicial) {
                return {
                    codigo: 404,
                    datos: {
                        mensaje: 'Solicitud no encontrada'
                    }
                }
            }

            const propiedad = await Propiedad.findByPk(
                solicitudInicial.propiedadId,
                {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                }
            )

            const solicitud = await Solicitud.findByPk(
                solicitudId,
                {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                }
            )

            if (!solicitud) {
                return {
                    codigo: 404,
                    datos: {
                        mensaje: 'Solicitud no encontrada'
                    }
                }
            }

            if (solicitud.estado !== 'aceptada') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La solicitud debe estar aceptada'
                    }
                }
            }

            if (
                !propiedad ||
                propiedad.estado !== 'disponible'
            ) {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'Propiedad no disponible'
                    }
                }
            }

            const existente = await Operacion.findOne({
                where: {
                    solicitudId
                },
                transaction: t,
                lock: t.LOCK.UPDATE
            })

            if (existente) {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La solicitud ya tiene una operacion'
                    }
                }
            }

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: solicitud.usuarioId
                },
                transaction: t
            })

            if (!cliente) {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'El interesado debe estar registrado como cliente'
                    }
                }
            }

            let tipoCliente = 'comprador'

            if (propiedad.finalidad === 'alquiler') {
                tipoCliente = 'arrendatario'
            }

            if (cliente.tipo !== tipoCliente) {
                return {
                    codigo: 400,
                    datos: {
                        mensaje: 'Tipo de cliente incorrecto'
                    }
                }
            }

            const operacion = await Operacion.create({
                solicitudId: solicitud.id,
                clienteId: cliente.id,
                propiedadId: propiedad.id,
                agenteId: req.usuario.id,
                tipo: propiedad.finalidad,
                monto,
                estado: 'pendiente'
            }, {
                transaction: t
            })

            await Propiedad.update({
                estado: 'reservada'
            }, {
                where: {
                    id: propiedad.id
                },
                transaction: t
            })

            return {
                codigo: 201,
                datos: operacion
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {

        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'La solicitud ya tiene una operacion'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar operacion'
        })
    }
})


// Determinar operaciones permitidas
async function condicionesOperacion(usuario) {

    if (usuario.rol === 'agente') {
        return {}
    }

    const cliente = await Cliente.findOne({
        where: {
            usuarioId: usuario.id
        }
    })

    if (!cliente) {
        return null
    }

    if (['comprador', 'arrendatario'].includes(usuario.rol)) {
        return {
            clienteId: cliente.id
        }
    }

    if (['vendedor', 'propietario'].includes(usuario.rol)) {

        const propiedades = await Propiedad.findAll({
            where: {
                clienteId: cliente.id
            }
        })

        if (propiedades.length === 0) {
            return null
        }

        const ids = []

        for (const propiedad of propiedades) {
            ids.push(propiedad.id)
        }

        return {
            propiedadId: ids
        }
    }

    return null
}


// Consultar operaciones
app.get('/operacion', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesOperacion(req.usuario)

        if (condiciones === null) {
            return resp.status(200).json([])
        }

        const operaciones = await Operacion.findAll({
            where: condiciones
        })

        resp.status(200).json(operaciones)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar operaciones'
        })
    }
})


// Consultar operacion por ID
app.get('/operacion/:id', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesOperacion(req.usuario)

        if (condiciones === null) {
            return resp.status(404).json({
                mensaje: 'Operacion no encontrada'
            })
        }

        condiciones.id = req.params.id

        const operacion = await Operacion.findOne({
            where: condiciones
        })

        if (!operacion) {
            return resp.status(404).json({
                mensaje: 'Operacion no encontrada'
            })
        }

        resp.status(200).json(operacion)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar operacion'
        })
    }
})


// Cancelar operacion
app.put('/operacion/:id/cancelar', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const operacionInicial = await Operacion.findByPk(req.params.id)

        if (!operacionInicial) {
            return resp.status(404).json({
                mensaje: 'Operacion no encontrada'
            })
        }

        const resultado = await sequelize.transaction(async (t) => {

            const propiedad = await Propiedad.findByPk(
                operacionInicial.propiedadId,
                {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                }
            )

            const operacion = await Operacion.findByPk(req.params.id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            })

            if (operacion.estado !== 'pendiente') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'Solamente se pueden cancelar operaciones pendientes'
                    }
                }
            }

            if (!propiedad || propiedad.estado !== 'reservada') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'El estado de la propiedad no permite cancelar la operacion'
                    }
                }
            }

            await Operacion.update({
                estado: 'cancelada'
            }, {
                where: {
                    id: operacion.id
                },
                transaction: t
            })

            await Propiedad.update({
                estado: 'disponible'
            }, {
                where: {
                    id: operacion.propiedadId
                },
                transaction: t
            })

            await Solicitud.update({
                estado: 'cancelada'
            }, {
                where: {
                    id: operacion.solicitudId
                },
                transaction: t
            })

            return {
                codigo: 200,
                datos: {
                    mensaje: 'Operacion cancelada correctamente'
                }
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al cancelar operacion'
        })
    }
})

// ==================================================
// MODULO DE CONTRATOS
// ==================================================


// Validar fecha
function fechaValida(fecha) {

    if (typeof fecha !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return false
    }

    const valor = new Date(fecha)

    return !isNaN(valor.getTime()) &&
        valor.toISOString().slice(0, 10) === fecha
}


// Registrar contrato
app.post('/contrato', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const {
            operacionId,
            fechaInicio,
            fechaFin,
            condiciones
        } = req.body || {}

        if (!Number.isInteger(operacionId) || operacionId <= 0) {
            return resp.status(400).json({
                mensaje: 'Operacion no valida'
            })
        }

        if (!fechaValida(fechaInicio)) {
            return resp.status(400).json({
                mensaje: 'Fecha de inicio no valida'
            })
        }

        if (typeof condiciones !== 'string' || !condiciones.trim()) {
            return resp.status(400).json({
                mensaje: 'Debe proporcionar las condiciones del contrato'
            })
        }

        const operacionInicial = await Operacion.findByPk(operacionId)

        if (!operacionInicial) {
            return resp.status(404).json({
                mensaje: 'Operacion no encontrada'
            })
        }

        const resultado = await sequelize.transaction(async (t) => {

            const propiedad = await Propiedad.findByPk(
                operacionInicial.propiedadId,
                {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                }
            )

            const operacion = await Operacion.findByPk(operacionId, {
                transaction: t,
                lock: t.LOCK.UPDATE
            })

            if (operacion.estado !== 'pendiente') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La operacion debe estar pendiente'
                    }
                }
            }

            if (!propiedad || propiedad.estado !== 'reservada') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La propiedad debe estar reservada'
                    }
                }
            }

            const existente = await Contrato.findOne({
                where: {
                    operacionId: operacionId
                },
                transaction: t
            })

            if (existente) {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La operacion ya tiene un contrato'
                    }
                }
            }

            let vencimiento = null
            let estadoPropiedad = 'vendida'
            let estadoContrato = 'finalizado'

            if (operacion.tipo === 'alquiler') {

                if (!fechaValida(fechaFin) || fechaFin <= fechaInicio) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'Fecha de vencimiento no valida'
                        }
                    }
                }

                vencimiento = fechaFin
                estadoPropiedad = 'alquilada'
                estadoContrato = 'vigente'

            } else {

                if (fechaFin !== undefined && fechaFin !== null) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'Los contratos de venta no requieren fecha de vencimiento'
                        }
                    }
                }
            }

            const contrato = await Contrato.create({
                operacionId: operacion.id,
                fechaInicio: fechaInicio,
                fechaFin: vencimiento,
                condiciones: condiciones.trim(),
                estado: estadoContrato
            }, {
                transaction: t
            })

            await Operacion.update({
                estado: 'finalizada'
            }, {
                where: {
                    id: operacion.id
                },
                transaction: t
            })

            await Propiedad.update({
                estado: estadoPropiedad
            }, {
                where: {
                    id: propiedad.id
                },
                transaction: t
            })

            return {
                codigo: 201,
                datos: contrato
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {

        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'La operacion ya tiene un contrato'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar contrato'
        })
    }
})


// Consultar contratos
app.get('/contrato', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesOperacion(req.usuario)

        if (condiciones === null) {
            return resp.status(200).json([])
        }

        const operaciones = await Operacion.findAll({
            where: condiciones
        })

        if (operaciones.length === 0) {
            return resp.status(200).json([])
        }

        const ids = []

        for (const operacion of operaciones) {
            ids.push(operacion.id)
        }

        const contratos = await Contrato.findAll({
            where: {
                operacionId: ids
            }
        })

        resp.status(200).json(contratos)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar contratos'
        })
    }
})


// Consultar contrato por ID
app.get('/contrato/:id', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesOperacion(req.usuario)

        if (condiciones === null) {
            return resp.status(404).json({
                mensaje: 'Contrato no encontrado'
            })
        }

        const contrato = await Contrato.findByPk(req.params.id)

        if (!contrato) {
            return resp.status(404).json({
                mensaje: 'Contrato no encontrado'
            })
        }

        condiciones.id = contrato.operacionId

        const operacion = await Operacion.findOne({
            where: condiciones
        })

        if (!operacion) {
            return resp.status(404).json({
                mensaje: 'Contrato no encontrado'
            })
        }

        resp.status(200).json({
            contrato: contrato,
            operacion: operacion
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar contrato'
        })
    }
})

// Finalizar contrato de alquiler
app.put('/contrato/:id/finalizar',
    validarSesion,
    validarRol('agente'),
    async (req, resp) => {

        try {

            const contratoInicial = await Contrato.findByPk(
                req.params.id
            )

            if (!contratoInicial) {
                return resp.status(404).json({
                    mensaje: 'Contrato no encontrado'
                })
            }

            const operacionInicial = await Operacion.findByPk(
                contratoInicial.operacionId
            )

            if (!operacionInicial) {
                return resp.status(404).json({
                    mensaje: 'Operacion no encontrada'
                })
            }

            const resultado = await sequelize.transaction(async t => {

                const propiedad = await Propiedad.findByPk(
                    operacionInicial.propiedadId,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                const operacion = await Operacion.findByPk(
                    operacionInicial.id,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                const contrato = await Contrato.findByPk(
                    contratoInicial.id,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    }
                )

                if (!propiedad || !operacion || !contrato) {
                    return {
                        estado: 404,
                        datos: {
                            mensaje: 'Informacion no encontrada'
                        }
                    }
                }

                if (operacion.tipo !== 'alquiler') {
                    return {
                        estado: 409,
                        datos: {
                            mensaje: 'Solo se pueden finalizar contratos de alquiler'
                        }
                    }
                }

                if (contrato.estado !== 'vigente') {
                    return {
                        estado: 409,
                        datos: {
                            mensaje: 'El contrato ya esta finalizado'
                        }
                    }
                }

                if (
                    propiedad.estado !== 'alquilada' ||
                    operacion.estado !== 'finalizada'
                ) {
                    return {
                        estado: 409,
                        datos: {
                            mensaje: 'Estado de alquiler incorrecto'
                        }
                    }
                }

                if (
                    !contrato.fechaFin ||
                    contrato.fechaFin > fechaActualPago()
                ) {
                    return {
                        estado: 409,
                        datos: {
                            mensaje: 'El contrato aun no llega a su fecha de finalizacion'
                        }
                    }
                }

                const pagosPendientes = await Pago.findAll({
                    where: {
                        contratoId: contrato.id,
                        fechaPago: null
                    },
                    transaction: t
                })

                if (pagosPendientes.length > 0) {
                    return {
                        estado: 409,
                        datos: {
                            mensaje: 'El contrato tiene pagos sin confirmar'
                        }
                    }
                }

                await Contrato.update(
                    {
                        estado: 'finalizado'
                    },
                    {
                        where: { id: contrato.id },
                        transaction: t
                    }
                )

                await Propiedad.update(
                    {
                        estado: 'disponible'
                    },
                    {
                        where: { id: propiedad.id },
                        transaction: t
                    }
                )

                return {
                    estado: 200,
                    datos: {
                        mensaje: 'Contrato finalizado correctamente',
                        contratoId: contrato.id,
                        propiedadId: propiedad.id,
                        estadoContrato: 'finalizado',
                        estadoPropiedad: 'disponible'
                    }
                }
            })

            resp.status(resultado.estado).json(resultado.datos)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al finalizar contrato'
            })
        }
    }
)

// ==================================================
// MODULO DE PAGOS Y VENCIMIENTOS
// ==================================================


// Obtener fecha actual
function fechaActualPago() {

    const hoy = new Date()

    const anio = hoy.getFullYear()
    const mes = String(hoy.getMonth() + 1).padStart(2, '0')
    const dia = String(hoy.getDate()).padStart(2, '0')

    return `${anio}-${mes}-${dia}`
}


// Determinar estado del pago
function estadoPago(pago) {

    if (pago.fechaPago !== null) {
        return 'pagado'
    }

    if (pago.fechaVencimiento < fechaActualPago()) {
        return 'vencido'
    }

    return 'pendiente'
}


// Obtener informacion del pago
function informacionPago(pago) {

    return {
        id: pago.id,
        contratoId: pago.contratoId,
        monto: pago.monto,
        fechaVencimiento: pago.fechaVencimiento,
        fechaPago: pago.fechaPago,
        metodoPago: pago.metodoPago,
        observacion: pago.observacion,
        estado: estadoPago(pago)
    }
}


// Registrar pago pendiente
app.post('/pago', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const {
            contratoId,
            monto,
            fechaVencimiento,
            observacion
        } = req.body || {}

        if (!Number.isInteger(contratoId) || contratoId <= 0) {
            return resp.status(400).json({
                mensaje: 'Contrato no valido'
            })
        }

        if (
            typeof monto !== 'number' ||
            !Number.isFinite(monto) ||
            monto < 0.01 ||
            monto > 9999999999.99 ||
            !/^\d+(\.\d{1,2})?$/.test(String(monto))
        ) {
            return resp.status(400).json({
                mensaje: 'Monto no valido'
            })
        }

        if (!fechaValida(fechaVencimiento)) {
            return resp.status(400).json({
                mensaje: 'Fecha de vencimiento no valida'
            })
        }

        if (
            observacion !== undefined &&
            observacion !== null &&
            typeof observacion !== 'string'
        ) {
            return resp.status(400).json({
                mensaje: 'Observacion no valida'
            })
        }

        const resultado = await sequelize.transaction(async (t) => {

            const contrato = await Contrato.findByPk(contratoId, {
                transaction: t,
                lock: t.LOCK.UPDATE
            })

            if (!contrato) {
                return {
                    codigo: 404,
                    datos: {
                        mensaje: 'Contrato no encontrado'
                    }
                }
            }

            const operacion = await Operacion.findByPk(
                contrato.operacionId,
                {
                    transaction: t
                }
            )

            if (!operacion || operacion.estado !== 'finalizada') {
                return {
                    codigo: 409,
                    datos: {
                        mensaje: 'La operacion debe estar finalizada'
                    }
                }
            }

            if (fechaVencimiento < contrato.fechaInicio) {
                return {
                    codigo: 400,
                    datos: {
                        mensaje: 'El vencimiento no puede ser anterior al contrato'
                    }
                }
            }

            const pagos = await Pago.findAll({
                where: {
                    contratoId: contrato.id
                },
                transaction: t
            })

            let total = 0

            for (const pago of pagos) {

                if (pago.fechaVencimiento === fechaVencimiento) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'Ya existe un pago para esta fecha'
                        }
                    }
                }

                total += Math.round(Number(pago.monto) * 100)
            }

            const montoCentavos = Math.round(monto * 100)

            const montoOperacion = Math.round(
                Number(operacion.monto) * 100
            )

            if (operacion.tipo === 'venta') {

                if (total + montoCentavos > montoOperacion) {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'Los pagos superan el monto de la venta'
                        }
                    }
                }

            } else {

                if (contrato.estado !== 'vigente') {
                    return {
                        codigo: 409,
                        datos: {
                            mensaje: 'El contrato de alquiler no esta vigente'
                        }
                    }
                }

                if (
                    !contrato.fechaFin ||
                    fechaVencimiento > contrato.fechaFin
                ) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'El vencimiento supera la fecha del contrato'
                        }
                    }
                }

                if (montoCentavos !== montoOperacion) {
                    return {
                        codigo: 400,
                        datos: {
                            mensaje: 'El monto debe coincidir con la mensualidad'
                        }
                    }
                }

                for (const pago of pagos) {

                    if (
                        pago.fechaVencimiento.slice(0, 7) ===
                        fechaVencimiento.slice(0, 7)
                    ) {
                        return {
                            codigo: 409,
                            datos: {
                                mensaje: 'Ya existe un pago para este mes'
                            }
                        }
                    }
                }
            }

            const pago = await Pago.create({
                contratoId: contrato.id,
                monto: monto,
                fechaVencimiento: fechaVencimiento,
                fechaPago: null,
                metodoPago: null,
                observacion: observacion || null
            }, {
                transaction: t
            })

            return {
                codigo: 201,
                datos: informacionPago(pago)
            }
        })

        resp.status(resultado.codigo).json(resultado.datos)

    } catch (error) {

        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El pago ya existe'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar pago'
        })
    }
})


// Determinar pagos permitidos
async function condicionesPago(usuario) {

    if (usuario.rol === 'agente') {
        return {}
    }

    const condiciones = await condicionesOperacion(usuario)

    if (condiciones === null) {
        return null
    }

    const operaciones = await Operacion.findAll({
        where: condiciones
    })

    if (operaciones.length === 0) {
        return null
    }

    const idsOperaciones = []

    for (const operacion of operaciones) {
        idsOperaciones.push(operacion.id)
    }

    const contratos = await Contrato.findAll({
        where: {
            operacionId: idsOperaciones
        }
    })

    if (contratos.length === 0) {
        return null
    }

    const idsContratos = []

    for (const contrato of contratos) {
        idsContratos.push(contrato.id)
    }

    return {
        contratoId: idsContratos
    }
}


// Consultar pagos
app.get('/pago', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesPago(req.usuario)

        if (condiciones === null) {
            return resp.status(200).json([])
        }

        const pagos = await Pago.findAll({
            where: condiciones,
            order: [['fechaVencimiento', 'ASC']]
        })

        const resultado = []

        for (const pago of pagos) {
            resultado.push(informacionPago(pago))
        }

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar pagos'
        })
    }
})


// Consultar pago por ID
app.get('/pago/:id', validarSesion, async (req, resp) => {
    try {
        const condiciones = await condicionesPago(req.usuario)

        if (condiciones === null) {
            return resp.status(404).json({
                mensaje: 'Pago no encontrado'
            })
        }

        condiciones.id = req.params.id

        const pago = await Pago.findOne({
            where: condiciones
        })

        if (!pago) {
            return resp.status(404).json({
                mensaje: 'Pago no encontrado'
            })
        }

        resp.status(200).json(informacionPago(pago))

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar pago'
        })
    }
})


// Confirmar pago recibido
app.put('/pago/:id/pagar', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const { metodoPago, observacion } = req.body || {}

        if (![
            'efectivo',
            'transferencia',
            'tarjeta',
            'cheque'
        ].includes(metodoPago)) {
            return resp.status(400).json({
                mensaje: 'Metodo de pago no valido'
            })
        }

        if (
            observacion !== undefined &&
            observacion !== null &&
            typeof observacion !== 'string'
        ) {
            return resp.status(400).json({
                mensaje: 'Observacion no valida'
            })
        }

        const pago = await Pago.findByPk(req.params.id)

        if (!pago) {
            return resp.status(404).json({
                mensaje: 'Pago no encontrado'
            })
        }

        if (pago.fechaPago !== null) {
            return resp.status(409).json({
                mensaje: 'El pago ya fue registrado'
            })
        }

        const [actualizado] = await Pago.update({
            fechaPago: fechaActualPago(),
            metodoPago: metodoPago,
            observacion: observacion === undefined
                ? pago.observacion
                : observacion
        }, {
            where: {
                id: pago.id,
                fechaPago: null
            }
        })

        if (actualizado === 0) {
            return resp.status(409).json({
                mensaje: 'El pago ya fue registrado'
            })
        }

        const pagoActualizado = await Pago.findByPk(pago.id)

        resp.status(200).json({
            mensaje: 'Pago registrado correctamente',
            pago: informacionPago(pagoActualizado)
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al confirmar pago'
        })
    }
})
// ==================================================
// MODULO DE REPORTES
// ==================================================


// Reporte de ingresos
app.get('/reporte/ingresos', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const operaciones = await Operacion.findAll()
        const contratos = await Contrato.findAll()
        const pagos = await Pago.findAll()

        let ingresosVentas = 0
        let ingresosAlquileres = 0
        let pagosPendientes = 0
        let pagosVencidos = 0
        let cantidadPagos = 0

        for (const pago of pagos) {

            const contrato = contratos.find(
                c => c.id === pago.contratoId
            )

            if (!contrato) {
                continue
            }

            const operacion = operaciones.find(
                o => o.id === contrato.operacionId
            )

            if (!operacion) {
                continue
            }

            const monto = Math.round(Number(pago.monto) * 100)

            if (pago.fechaPago !== null) {

                cantidadPagos++

                if (operacion.tipo === 'venta') {
                    ingresosVentas += monto
                } else {
                    ingresosAlquileres += monto
                }

            } else {

                if (estadoPago(pago) === 'vencido') {
                    pagosVencidos += monto
                } else {
                    pagosPendientes += monto
                }
            }
        }

        resp.status(200).json({
            ingresosVentas: ingresosVentas / 100,
            ingresosAlquileres: ingresosAlquileres / 100,
            ingresosTotales: (ingresosVentas + ingresosAlquileres) / 100,
            pagosPendientes: pagosPendientes / 100,
            pagosVencidos: pagosVencidos / 100,
            cantidadPagos: cantidadPagos
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al generar reporte de ingresos'
        })
    }
})


// Reporte de propiedades con mayor demanda
app.get('/reporte/demanda', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const propiedades = await Propiedad.findAll()
        const solicitudes = await Solicitud.findAll()

        const resultado = []

        for (const propiedad of propiedades) {

            const interesados = solicitudes.filter(
                s => s.propiedadId === propiedad.id
            )

            const usuarios = new Set()

            for (const solicitud of interesados) {
                usuarios.add(solicitud.usuarioId)
            }

            resultado.push({
                propiedadId: propiedad.id,
                titulo: propiedad.titulo,
                tipo: propiedad.tipo,
                finalidad: propiedad.finalidad,
                zona: propiedad.zona,
                estado: propiedad.estado,
                totalSolicitudes: interesados.length,
                totalInteresados: usuarios.size
            })
        }

        resultado.sort(
            (a, b) => b.totalInteresados - a.totalInteresados
        )

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al generar reporte de demanda'
        })
    }
})


// Reporte de rendimiento de agentes
app.get('/reporte/agentes', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const agentes = await Usuario.findAll({
            where: {
                rol: 'agente'
            },
            attributes: ['id', 'nombre', 'apellido']
        })

        const operaciones = await Operacion.findAll()

        const resultado = []

        for (const agente of agentes) {

            let ventas = 0
            let alquileres = 0
            let pendientes = 0
            let canceladas = 0

            const operacionesAgente = operaciones.filter(
                o => o.agenteId === agente.id
            )

            for (const operacion of operacionesAgente) {

                if (operacion.estado === 'finalizada') {

                    if (operacion.tipo === 'venta') {
                        ventas++
                    } else {
                        alquileres++
                    }

                } else if (operacion.estado === 'pendiente') {

                    pendientes++

                } else if (operacion.estado === 'cancelada') {

                    canceladas++
                }
            }

            resultado.push({
                agenteId: agente.id,
                nombre: agente.nombre,
                apellido: agente.apellido,
                ventas: ventas,
                alquileres: alquileres,
                operacionesFinalizadas: ventas + alquileres,
                operacionesPendientes: pendientes,
                operacionesCanceladas: canceladas,
                totalOperaciones: operacionesAgente.length
            })
        }

        resultado.sort(
            (a, b) => b.operacionesFinalizadas - a.operacionesFinalizadas
        )

        resp.status(200).json(resultado)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al generar reporte de agentes'
        })
    }
})

// ==========================================
// MODULO DE SOLICITUDES DE ACTUALIZACION
// ==========================================


// Registrar solicitud de actualizacion
app.post('/solicitud-actualizacion',
    validarSesion,
    validarRol('propietario', 'vendedor'),
    async (req, resp) => {

        try {

            const { propiedadId, mensaje } = req.body || {}

            if (
                !Number.isInteger(propiedadId) ||
                propiedadId <= 0 ||
                typeof mensaje !== 'string' ||
                !mensaje.trim() ||
                mensaje.length > 1000
            ) {
                return resp.status(400).json({
                    mensaje: 'Complete los campos correctamente'
                })
            }

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(403).json({
                    mensaje: 'No tiene un cliente asociado'
                })
            }

            const propiedad = await Propiedad.findByPk(
                propiedadId
            )

            if (!propiedad) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            if (propiedad.clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos sobre esta propiedad'
                })
            }

            const solicitud = await SolicitudActualizacion.create({
                usuarioId: req.usuario.id,
                propiedadId,
                mensaje: mensaje.trim(),
                estado: 'pendiente'
            })

            resp.status(201).json({
                mensaje: 'Solicitud registrada correctamente',
                solicitud
            })

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al registrar solicitud de actualizacion'
            })
        }
    }
)


// Consultar solicitudes de actualizacion
app.get('/solicitud-actualizacion',
    validarSesion,
    validarRol('propietario', 'vendedor', 'agente'),
    async (req, resp) => {

        try {

            let condiciones = {}

            if (req.usuario.rol !== 'agente') {

                condiciones.usuarioId = req.usuario.id
            }

            const solicitudes = await SolicitudActualizacion.findAll({
                where: condiciones,
                order: [['fecha', 'DESC']]
            })

            resp.status(200).json(solicitudes)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al consultar solicitudes de actualizacion'
            })
        }
    }
)


// Consultar una solicitud de actualizacion
app.get('/solicitud-actualizacion/:id',
    validarSesion,
    validarRol('propietario', 'vendedor', 'agente'),
    async (req, resp) => {

        try {

            const id = Number(req.params.id)

            if (!Number.isInteger(id) || id <= 0) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            let condiciones = {
                id
            }

            if (req.usuario.rol !== 'agente') {

                condiciones.usuarioId = req.usuario.id
            }

            const solicitud = await SolicitudActualizacion.findOne({
                where: condiciones
            })

            if (!solicitud) {
                return resp.status(404).json({
                    mensaje: 'Solicitud no encontrada'
                })
            }

            resp.status(200).json(solicitud)

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al consultar solicitud de actualizacion'
            })
        }
    }
)


// Atender o rechazar solicitud de actualizacion
app.put('/solicitud-actualizacion/:id/estado',
    validarSesion,
    validarRol('agente'),
    async (req, resp) => {

        try {

            const id = Number(req.params.id)

            const { estado, respuesta } = req.body || {}

            if (!Number.isInteger(id) || id <= 0) {
                return resp.status(400).json({
                    mensaje: 'Identificador no valido'
                })
            }

            const estados = [
                'atendida',
                'rechazada'
            ]

            if (!estados.includes(estado)) {
                return resp.status(400).json({
                    mensaje: 'Estado no valido'
                })
            }

            if (
                typeof respuesta !== 'string' ||
                !respuesta.trim() ||
                respuesta.length > 1000
            ) {
                return resp.status(400).json({
                    mensaje: 'Debe proporcionar una respuesta'
                })
            }

            const solicitud = await SolicitudActualizacion.findByPk(id)

            if (!solicitud) {
                return resp.status(404).json({
                    mensaje: 'Solicitud no encontrada'
                })
            }

            if (solicitud.estado !== 'pendiente') {
                return resp.status(409).json({
                    mensaje: 'La solicitud ya fue procesada'
                })
            }

            const [actualizadas] = await SolicitudActualizacion.update(
                {
                    estado,
                    respuesta: respuesta.trim(),
                    agenteId: req.usuario.id,
                    fechaRespuesta: new Date()
                },
                {
                    where: {
                        id,
                        estado: 'pendiente'
                    }
                }
            )

            if (actualizadas === 0) {
                return resp.status(409).json({
                    mensaje: 'La solicitud ya fue procesada'
                })
            }

            const solicitudActualizada =
                await SolicitudActualizacion.findByPk(id)

            resp.status(200).json({
                mensaje: 'Solicitud procesada correctamente',
                solicitud: solicitudActualizada
            })

        } catch (error) {

            resp.status(500).json({
                mensaje: 'Error al procesar solicitud de actualizacion'
            })
        }
    }
)


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
