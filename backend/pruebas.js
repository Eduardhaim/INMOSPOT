const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')

const URL = process.env.PRUEBA_URL || 'http://localhost:5000'

const identificador = Date.now()
const contrasenaPrueba = randomBytes(12).toString('hex')

let total = 0


// Ejecutar peticiones a la API
async function prueba(nombre, metodo, ruta, token, body, esperado) {

    const headers = {}

    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    let contenido

    if (body instanceof FormData) {

        contenido = body

    } else if (body !== undefined) {

        headers['Content-Type'] = 'application/json'
        contenido = JSON.stringify(body)
    }

    const respuesta = await fetch(URL + ruta, {
        method: metodo,
        headers,
        body: contenido
    })

    const datos = await respuesta.json()

    const estados = Array.isArray(esperado)
        ? esperado
        : [esperado]

    if (!estados.includes(respuesta.status)) {

        console.log(`ERROR | ${nombre}`)
        console.log('Esperado:', esperado)
        console.log('Recibido:', respuesta.status)
        console.log('Mensaje:', datos.mensaje)

        throw new Error('Prueba incorrecta')
    }

    total++

    console.log(
        `CORRECTO | ${nombre} | ${respuesta.status}`
    )

    return datos
}


// Obtener fecha local
function fecha(dias = 0) {

    const actual = new Date()

    actual.setDate(actual.getDate() + dias)

    const anio = actual.getFullYear()

    const mes = String(
        actual.getMonth() + 1
    ).padStart(2, '0')

    const dia = String(
        actual.getDate()
    ).padStart(2, '0')

    return `${anio}-${mes}-${dia}`
}


// Crear usuario de prueba
async function crearUsuario(rol) {

    const correo =
        `${rol}${identificador}@inmospot.com`

    await prueba(
        `Registrar ${rol}`,
        'POST', '/registro', null,
        {
            nombre: 'Usuario',
            apellido: 'Prueba',
            correo,
            contrasena: contrasenaPrueba,
            rol
        },
        201
    )

    return await prueba(
        `Iniciar sesion como ${rol}`,
        'POST', '/login', null,
        {
            correo,
            contrasena: contrasenaPrueba
        },
        200
    )
}


// Crear cliente asociado
async function crearCliente(usuario, token) {

    return await prueba(
        `Crear cliente ${usuario.rol}`,
        'POST', '/cliente', token,
        {
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            telefono: '99990000',
            direccion: 'Tegucigalpa',
            tipo: usuario.rol,
            usuarioId: usuario.id
        },
        201
    )
}


// Datos de una propiedad
function datosPropiedad(finalidad) {

    return {
        titulo: `Prueba ${finalidad} ${identificador}`,
        descripcion: 'Propiedad para pruebas automatizadas',
        tipo: 'apartamento',
        finalidad,
        precio: finalidad === 'venta' ? 100000 : 12000,
        ubicacion: 'Tegucigalpa',
        zona: 'Colonia Palmira',
        caracteristicas: 'Dos habitaciones'
    }
}


// Ejecutar todas las pruebas
async function ejecutarPruebas() {

    assert.ok(
        process.env.PRUEBA_AGENTE_PASSWORD,
        'Debe configurar PRUEBA_AGENTE_PASSWORD'
    )


    console.log('\n--- 1. USUARIOS Y SESIONES ---\n')

    await prueba(
        'Comprobar funcionamiento de la API',
        'GET', '/', null, undefined, 200
    )

    await prueba(
        'Impedir acceso sin sesion',
        'GET', '/perfil', null, undefined, 401
    )

    const agente = await prueba(
        'Inicio de sesion como agente',
        'POST', '/login', null,
        {
            correo: process.env.PRUEBA_AGENTE_CORREO ||
                'agente@inmospot.com',
            contrasena: process.env.PRUEBA_AGENTE_PASSWORD
        },
        200
    )

    const A = agente.token

    assert.equal(agente.usuario.rol, 'agente')

    const propietario = await crearUsuario('propietario')
    const comprador = await crearUsuario('comprador')
    const arrendatario = await crearUsuario('arrendatario')
    const vendedor = await crearUsuario('vendedor')

    const P = propietario.token
    const C = comprador.token
    const R = arrendatario.token
    const V = vendedor.token

    const perfil = await prueba(
        'Consultar perfil',
        'GET', '/perfil', P, undefined, 200
    )

    assert.equal(perfil.id, propietario.usuario.id)
    assert.equal(perfil.contrasena, undefined)

    await prueba(
        'Impedir registro publico de agentes',
        'POST', '/registro', null,
        {
            nombre: 'Agente',
            apellido: 'Prueba',
            correo: `agente${identificador}@inmospot.com`,
            contrasena: contrasenaPrueba,
            rol: 'agente'
        },
        400
    )

    await prueba(
        'Rechazar contrasena incorrecta',
        'POST', '/login', null,
        {
            correo: comprador.usuario.correo,
            contrasena: contrasenaPrueba + 'incorrecta'
        },
        401
    )


    console.log('\n--- 2. CLIENTES Y USUARIOS ---\n')

    const usuarios = await prueba(
        'Consultar usuarios como agente',
        'GET', '/usuario', A, undefined, 200
    )

    assert.ok(usuarios.every(
        u => u.contrasena === undefined
    ))

    assert.ok(usuarios.some(
        u => u.id === propietario.usuario.id &&
            u.clienteId === null
    ))

    await prueba(
        'Impedir consulta de usuarios como comprador',
        'GET', '/usuario', C, undefined, 403
    )

    const clientePropietario =
        await crearCliente(propietario.usuario, A)

    const clienteComprador =
        await crearCliente(comprador.usuario, A)

    const clienteArrendatario =
        await crearCliente(arrendatario.usuario, A)

    const clienteVendedor =
        await crearCliente(vendedor.usuario, A)

    const usuariosAsociados = await prueba(
        'Comprobar cuenta asociada',
        'GET', '/usuario', A, undefined, 200
    )

    assert.ok(usuariosAsociados.some(
        u => u.id === propietario.usuario.id &&
            u.clienteId === clientePropietario.id
    ))

    await prueba(
        'Impedir cliente duplicado',
        'POST', '/cliente', A,
        clientePropietario, 409
    )

    await prueba(
        'Rechazar correo incorrecto',
        'POST', '/cliente', A,
        {
            ...clientePropietario,
            correo: 'correo-invalido'
        },
        400
    )

    await prueba(
        'Impedir cambio de tipo de cliente',
        'PUT', `/cliente/${clientePropietario.id}`, A,
        {
            ...clientePropietario,
            tipo: 'comprador'
        },
        409
    )


    console.log('\n--- 3. PROPIEDADES Y FILTROS ---\n')

    const venta = await prueba(
        'Registrar propiedad de venta',
        'POST', '/propiedad', P,
        datosPropiedad('venta'), 201
    )

    const alquiler = await prueba(
        'Registrar propiedad de alquiler',
        'POST', '/propiedad', P,
        datosPropiedad('alquiler'), 201
    )

    await prueba(
        'Impedir asignacion a cliente comprador',
        'POST', '/propiedad', A,
        {
            ...datosPropiedad('venta'),
            clienteId: clienteComprador.id
        },
        400
    )

    await prueba(
        'Rechazar precio con tres decimales',
        'POST', '/propiedad', P,
        {
            ...datosPropiedad('venta'),
            precio: 12000.555
        },
        400
    )

    const bienes = await prueba(
        'Consultar bienes del propietario',
        'GET',
        `/cliente/${clientePropietario.id}/propiedades`,
        P, undefined, 200
    )

    assert.equal(bienes.totalBienes, 2)

    await prueba(
        'Actualizar propiedad propia',
        'PUT', `/propiedad/${venta.id}`, P,
        {
            ...datosPropiedad('venta'),
            descripcion: 'Descripcion actualizada'
        },
        200
    )

    await prueba(
        'Impedir modificacion de propiedad ajena',
        'PUT', `/propiedad/${venta.id}`, V,
        datosPropiedad('venta'), 403
    )

    const filtradas = await prueba(
        'Filtrar propiedades por precio y tipo',
        'GET',
        '/propiedad/buscar/apartamento/todas?precioMin=90000&precioMax=110000',
        C, undefined, 200
    )

    assert.ok(filtradas.some(
        p => p.id === venta.id
    ))

    assert.ok(filtradas.every(
        p => p.finalidad === 'venta' &&
            p.estado === 'disponible' &&
            Number(p.precio) >= 90000 &&
            Number(p.precio) <= 110000
    ))

    await prueba(
        'Rechazar rango de precios incorrecto',
        'GET',
        '/propiedad/buscar/todos/todas?precioMin=500&precioMax=100',
        C, undefined, 400
    )

    await prueba(
        'Impedir venta manual sin contrato',
        'PUT', `/propiedad/${venta.id}/estado`, A,
        { estado: 'vendida' }, 409
    )

    await prueba(
        'Reservar propiedad manualmente',
        'PUT', `/propiedad/${venta.id}/estado`, A,
        { estado: 'reservada' }, 200
    )

    await prueba(
        'Liberar reserva manual',
        'PUT', `/propiedad/${venta.id}/estado`, A,
        { estado: 'disponible' }, 200
    )

    const temporal = await prueba(
        'Registrar propiedad temporal',
        'POST', '/propiedad', V,
        datosPropiedad('venta'), 201
    )

    await prueba(
        'Impedir eliminacion de propiedad ajena',
        'DELETE', `/propiedad/${temporal.id}`,
        P, undefined, 403
    )

    await prueba(
        'Eliminar propiedad sin historial',
        'DELETE', `/propiedad/${temporal.id}`,
        V, undefined, 200
    )


    console.log('\n--- 4. FOTOGRAFIAS ---\n')

    await prueba(
        'Rechazar fotografia sin datos',
        'POST', '/fotografia',
        P, undefined, 400
    )

    await prueba(
        'Rechazar carga sin formulario',
        'POST', '/fotografia/subir',
        P, {}, 400
    )

    const imagen = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64'
    )

    const formulario = new FormData()

    formulario.append(
        'propiedadId',
        String(venta.id)
    )

    formulario.append(
        'imagen',
        new Blob([imagen], { type: 'image/png' }),
        'prueba.png'
    )

    const subida = await prueba(
        'Subir imagen real',
        'POST', '/fotografia/subir',
        P, formulario, 201
    )

    const fotografia = subida.fotografia

    const archivo = await fetch(
        URL + fotografia.url,
        {
            headers: {
                Authorization: `Bearer ${C}`
            }
        }
    )

    assert.equal(archivo.status, 200)

    assert.deepEqual(
        Buffer.from(await archivo.arrayBuffer()),
        imagen
    )

    console.log('CORRECTO | Contenido de imagen verificado')

    const falso = new FormData()

    falso.append(
        'propiedadId',
        String(venta.id)
    )

    falso.append(
        'imagen',
        new Blob(['Archivo falso'], { type: 'image/png' }),
        'falso.png'
    )

    await prueba(
        'Rechazar imagen falsa',
        'POST', '/fotografia/subir',
        P, falso, 400
    )

    await prueba(
        'Impedir eliminacion de foto como comprador',
        'DELETE', `/fotografia/${fotografia.id}`,
        C, undefined, 403
    )

    await prueba(
        'Eliminar fotografia',
        'DELETE', `/fotografia/${fotografia.id}`,
        P, undefined, 200
    )

    await prueba(
        'Comprobar imagen eliminada',
        'GET', fotografia.url,
        P, undefined, 404
    )


    console.log('\n--- 5. FAVORITOS ---\n')

    const favorito = await prueba(
        'Agregar favorito',
        'POST', '/favorito', C,
        { propiedadId: venta.id }, 201
    )

    await prueba(
        'Impedir favorito duplicado',
        'POST', '/favorito', C,
        { propiedadId: venta.id }, 409
    )

    const favoritos = await prueba(
        'Consultar favoritos',
        'GET', '/favorito', C, undefined, 200
    )

    assert.ok(favoritos.some(
        f => f.id === favorito.id
    ))

    await prueba(
        'Eliminar favorito',
        'DELETE', `/favorito/${favorito.id}`,
        C, undefined, 200
    )


    console.log('\n--- 6. SOLICITUDES INMOBILIARIAS ---\n')

    const solicitudes = await Promise.all([

        prueba(
            'Solicitud simultanea 1',
            'POST', '/solicitud', C,
            {
                propiedadId: venta.id,
                mensaje: 'Interesado en comprar'
            },
            [201, 409]
        ),

        prueba(
            'Solicitud simultanea 2',
            'POST', '/solicitud', C,
            {
                propiedadId: venta.id,
                mensaje: 'Interesado en comprar'
            },
            [201, 409]
        )
    ])

    const creadas = solicitudes.filter(
        s => s.id !== undefined
    )

    assert.equal(creadas.length, 1)

    const solicitudVenta = creadas[0]

    console.log(
        'CORRECTO | Solo se creo una solicitud simultanea'
    )

    await prueba(
        'Aceptar solicitud de venta',
        'PUT',
        `/solicitud/${solicitudVenta.id}/estado`,
        A, { estado: 'aceptada' }, 200
    )

    const solicitudAlquiler = await prueba(
        'Crear solicitud de alquiler',
        'POST', '/solicitud', R,
        {
            propiedadId: alquiler.id,
            mensaje: 'Interesado en alquilar'
        },
        201
    )

    await prueba(
        'Aceptar solicitud de alquiler',
        'PUT',
        `/solicitud/${solicitudAlquiler.id}/estado`,
        A, { estado: 'aceptada' }, 200
    )


    console.log('\n--- 7. OPERACIONES ---\n')

    await prueba(
        'Rechazar monto con tres decimales',
        'POST', '/operacion', A,
        {
            solicitudId: solicitudVenta.id,
            monto: 100000.555
        },
        400
    )

    const operacionVenta = await prueba(
        'Registrar operacion de venta',
        'POST', '/operacion', A,
        {
            solicitudId: solicitudVenta.id,
            monto: 100000
        },
        201
    )

    const operacionAlquiler = await prueba(
        'Registrar operacion de alquiler',
        'POST', '/operacion', A,
        {
            solicitudId: solicitudAlquiler.id,
            monto: 12000
        },
        201
    )

    await prueba(
        'Impedir liberar reserva con operacion',
        'PUT', `/propiedad/${alquiler.id}/estado`, A,
        { estado: 'disponible' }, 409
    )

    const reservada = await prueba(
        'Comprobar propiedad reservada',
        'GET', `/propiedad/${venta.id}`,
        A, undefined, 200
    )

    assert.equal(reservada.estado, 'reservada')


    console.log('\n--- 8. CONTRATOS ---\n')

    const contratoVenta = await prueba(
        'Registrar contrato de venta',
        'POST', '/contrato', A,
        {
            operacionId: operacionVenta.id,
            fechaInicio: fecha(),
            condiciones: 'Contrato de venta de prueba'
        },
        201
    )

    const contratoAlquiler = await prueba(
        'Registrar contrato de alquiler',
        'POST', '/contrato', A,
        {
            operacionId: operacionAlquiler.id,
            fechaInicio: fecha(-30),
            fechaFin: fecha(-1),
            condiciones: 'Contrato de alquiler de prueba'
        },
        201
    )

    assert.equal(contratoVenta.estado, 'finalizado')
    assert.equal(contratoAlquiler.estado, 'vigente')

    const vendida = await prueba(
        'Comprobar propiedad vendida',
        'GET', `/propiedad/${venta.id}`,
        A, undefined, 200
    )

    assert.equal(vendida.estado, 'vendida')

    const alquilada = await prueba(
        'Comprobar propiedad alquilada',
        'GET', `/propiedad/${alquiler.id}`,
        A, undefined, 200
    )

    assert.equal(alquilada.estado, 'alquilada')


    console.log('\n--- 9. PAGOS Y CIERRE DE ALQUILER ---\n')

    const ingresosAntes = await prueba(
        'Consultar ingresos iniciales',
        'GET', '/reporte/ingresos',
        A, undefined, 200
    )

    const pagoVenta = await prueba(
        'Registrar cuota de venta',
        'POST', '/pago', A,
        {
            contratoId: contratoVenta.id,
            monto: 1000,
            fechaVencimiento: fecha()
        },
        201
    )

    const pagoAlquiler = await prueba(
        'Registrar mensualidad de alquiler',
        'POST', '/pago', A,
        {
            contratoId: contratoAlquiler.id,
            monto: 12000,
            fechaVencimiento: fecha(-30)
        },
        201
    )

    assert.equal(pagoAlquiler.estado, 'vencido')

    await prueba(
        'Impedir cierre con pagos pendientes',
        'PUT',
        `/contrato/${contratoAlquiler.id}/finalizar`,
        A, undefined, 409
    )

    await prueba(
        'Confirmar pago de venta',
        'PUT', `/pago/${pagoVenta.id}/pagar`, A,
        { metodoPago: 'transferencia' }, 200
    )

    await prueba(
        'Confirmar pago de alquiler',
        'PUT', `/pago/${pagoAlquiler.id}/pagar`, A,
        { metodoPago: 'efectivo' }, 200
    )

    await prueba(
        'Impedir pago duplicado',
        'PUT', `/pago/${pagoAlquiler.id}/pagar`, A,
        { metodoPago: 'efectivo' }, 409
    )

    await prueba(
        'Finalizar contrato de alquiler',
        'PUT',
        `/contrato/${contratoAlquiler.id}/finalizar`,
        A, undefined, 200
    )

    const disponible = await prueba(
        'Comprobar propiedad nuevamente disponible',
        'GET', `/propiedad/${alquiler.id}`,
        A, undefined, 200
    )

    assert.equal(disponible.estado, 'disponible')

    await prueba(
        'Impedir cambio de propietario con historial',
        'PUT', `/propiedad/${alquiler.id}`, A,
        {
            ...datosPropiedad('alquiler'),
            clienteId: clienteVendedor.id
        },
        409
    )

    await prueba(
        'Impedir eliminacion de propiedad con historial',
        'DELETE', `/propiedad/${alquiler.id}`,
        A, undefined, 409
    )

    const nuevaSolicitud = await prueba(
        'Permitir nuevo alquiler al mismo arrendatario',
        'POST', '/solicitud', R,
        {
            propiedadId: alquiler.id,
            mensaje: 'Deseo alquilar nuevamente'
        },
        201
    )

    await prueba(
        'Aceptar nueva solicitud de alquiler',
        'PUT',
        `/solicitud/${nuevaSolicitud.id}/estado`,
        A, { estado: 'aceptada' }, 200
    )

    const nuevaOperacion = await prueba(
        'Registrar segunda operacion de alquiler',
        'POST', '/operacion', A,
        {
            solicitudId: nuevaSolicitud.id,
            monto: 12000
        },
        201
    )

    await prueba(
        'Cancelar segunda operacion',
        'PUT',
        `/operacion/${nuevaOperacion.id}/cancelar`,
        A, undefined, 200
    )

    const liberada = await prueba(
        'Comprobar propiedad liberada tras cancelacion',
        'GET', `/propiedad/${alquiler.id}`,
        A, undefined, 200
    )

    assert.equal(liberada.estado, 'disponible')

    await prueba(
        'Impedir acceso a contrato ajeno',
        'GET', `/contrato/${contratoAlquiler.id}`,
        C, undefined, 404
    )


    console.log('\n--- 10. REPORTES ---\n')

    const ingresos = await prueba(
        'Consultar reporte de ingresos',
        'GET', '/reporte/ingresos',
        A, undefined, 200
    )

    assert.equal(
        Math.round(
            (ingresos.ingresosVentas -
                ingresosAntes.ingresosVentas) * 100
        ),
        100000
    )

    assert.equal(
        Math.round(
            (ingresos.ingresosAlquileres -
                ingresosAntes.ingresosAlquileres) * 100
        ),
        1200000
    )

    assert.equal(
        ingresos.cantidadPagos -
            ingresosAntes.cantidadPagos,
        2
    )

    console.log('CORRECTO | Ingresos de prueba verificados')

    const demanda = await prueba(
        'Consultar reporte de demanda',
        'GET', '/reporte/demanda',
        A, undefined, 200
    )

    const demandaAlquiler = demanda.find(
        p => p.propiedadId === alquiler.id
    )

    assert.equal(demandaAlquiler.totalSolicitudes, 2)
    assert.equal(demandaAlquiler.totalInteresados, 1)

    const agentes = await prueba(
        'Consultar reporte de agentes',
        'GET', '/reporte/agentes',
        A, undefined, 200
    )

    assert.ok(agentes.some(
        a => a.agenteId === agente.usuario.id
    ))

    await prueba(
        'Impedir acceso a reportes como comprador',
        'GET', '/reporte/ingresos',
        C, undefined, 403
    )


    console.log('\n--- 11. SOLICITUDES DE ACTUALIZACION ---\n')

    const actualizacion = await prueba(
        'Crear solicitud de actualizacion',
        'POST', '/solicitud-actualizacion', P,
        {
            propiedadId: alquiler.id,
            mensaje: 'Solicito revisar la descripcion'
        },
        201
    )

    const idSolicitud = actualizacion.solicitud.id

    await prueba(
        'Impedir acceso de otro propietario o vendedor',
        'GET', `/solicitud-actualizacion/${idSolicitud}`,
        V, undefined, 404
    )

    await prueba(
        'Impedir que propietario atienda solicitud',
        'PUT',
        `/solicitud-actualizacion/${idSolicitud}/estado`,
        P,
        {
            estado: 'atendida',
            respuesta: 'Revisada'
        },
        403
    )

    await prueba(
        'Atender solicitud como agente',
        'PUT',
        `/solicitud-actualizacion/${idSolicitud}/estado`,
        A,
        {
            estado: 'atendida',
            respuesta: 'Descripcion revisada'
        },
        200
    )

    const atendida = await prueba(
        'Consultar respuesta del agente',
        'GET', `/solicitud-actualizacion/${idSolicitud}`,
        P, undefined, 200
    )

    assert.equal(atendida.estado, 'atendida')
    assert.equal(atendida.agenteId, agente.usuario.id)
    assert.ok(atendida.fechaRespuesta)


    console.log('\n--- 12. CIERRE DE SESIONES ---\n')

    for (const token of [P, C, R, V, A]) {

        await prueba(
            'Cerrar sesion',
            'POST', '/logout',
            token, undefined, 200
        )

        await prueba(
            'Impedir reutilizacion de token',
            'GET', '/perfil',
            token, undefined, 401
        )
    }


    console.log('\n========================================')
    console.log('TODAS LAS PRUEBAS CORRECTAS')
    console.log(`Peticiones verificadas: ${total}`)
    console.log('========================================\n')
}


ejecutarPruebas().catch(error => {

    console.error('\nPRUEBAS INTERRUMPIDAS')
    console.error(error.message)

    process.exitCode = 1
})