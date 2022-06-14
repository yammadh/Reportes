// Variables Globales
var datos_originales = [];
var datos_originales_legales = []; // datos legales puros
var datos_originales_legales_consolidados = []; // datos legales consolidados
var datos_consolidados = [];
var datos_casos_cerrados = [];
var datos_deudores_varios = [];
var datos_legales_nuevos = [] // Datos legales nuevos mes a mes a partir de abril 2022
var datos_casos_otros = []; // Casos sin asignar o asignados a otros usuarios
var datos_limpios = [] // Datos post eliminación de legales, deudores varios, etc.
var datos_vigentes_consolidados = [] // Datos post eliminación de legales, deudores varios, etc. consolidados (para mostrar)
var datos_vigentes_limpios = [] // Datos post eliminación de legales, deudores varios, etc. consolidados luego de compararlos con los pagos parciales
var datos_pago_parcial = [] // Datos de pagos parciales
var datos_deudas_4dias = [] // Almanceno las deudas menores a 4 días
var datos_pago_parcial_consolidado = [];
let dollarUSLocale = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', currencyDisplay: 'narrowSymbol'});
var nombre = "";

// Constantes en el ciclo de vida
const cte_sin_operador = "Sin Asignación";
let mesFiltro = 0;
let anioFiltro = 0;

// Parametría
let maxDeudoresVarios = 4000;

$( document ).ready(function() {
	document.getElementById("defaultOpen").click();
});

//var csv is the CSV file with headers
function csvJSON(csv) {
    var lines = csv.split("\n");
    var result = [];
    var headers = lines[0].split(";");

    for (var i = 1; i < lines.length; i++) {
        var obj = {};
        var currentline = lines[i].split(";");

        for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j];
        }

        result.push(obj);
    }

    return JSON.stringify(result);
}

/* main upload function */
function upload(file) {
    if (file.type.match(/text\/csv/) || file.type.match(/vnd\.ms-excel/)) {
        //if(file.type.match(/text\/csv/)){
        oFReader = new FileReader();
        oFReader.onloadend = function () {
            datos_originales = JSON.parse(csvJSON(this.result));
			
			// Elimino los registros que no tienen datos
			datos_originales = $.grep(datos_originales, function (dato) { return dato.NroCliente != ""});
			
			for(i = 0; i < datos_originales.length; i++){
				datos_originales[i].DeudaVda = parseInt(datos_originales[i].DeudaVda);
			}
			
			// Filtro datos y genero subpoblaciones de datos
            quitarLegales();
			quitarRegistrosTotal();
			quitarDeudoresVarios();
			quitarDeudoresMenores4Dias();
			quitarCasosCerradosPorMes(datos_limpios);
			calcularPagosParciales();
			compararCerradosVSParciales();
            cargarFiltros();
			inicializoCampos();
        };
        $("#divFiltro").show(700);
        oFReader.readAsText(file);
    } else {
        console.log("This file does not seem to be a CSV.");
    }
}

function quitarDeudoresMenores4Dias(){
	datos_deudas_4dias = $.grep(datos_limpios, function (dato) { return parseInt(dato.Dias) < 4 });
	datos_limpios = $.grep(datos_limpios, function (dato) { return parseInt(dato.DeudaVda) > 4 });
	datos_deudas_4dias = ordenar(datos_deudas_4dias);
}

function calcularPagosParciales(){
	var discMeses = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[1])));
	var discAnios = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[2])));
	
	// Ordeno los datos por Dias de Mora
	var datosOrdenados = distinctByNroCliente(datos_limpios);
	for (r = 0; r < discAnios.length; r++)
	{
		for (s = 0; s < discMeses.length; s++)
		{
			for (i = 0; i < datosOrdenados.length; i++){
				var datosCliente = $.grep(datos_limpios, function (dato) {return dato.NroCliente == datosOrdenados[i].item.NroCliente});
				datosCliente = mesEntero(datosCliente, discAnios[r].item, discMeses[s].item, 1);
				datosCliente = ordenar(datosCliente);
				
				var dias = 0;
				if (datosCliente[0] != undefined){
					dias = parseInt(datosCliente[0].Dias);
				}
				var deuda = 0;
				var deudaExistente = 0;
				
				for(j = 0; j < datosCliente.length; j++){
					if (parseInt(datosCliente[j].Dias) < dias){
						// Guardo el monto del pago parcial para poder mostrarlo después.
						if (deudaExistente > 0){
							deuda += parseFloat(datosCliente[j-1].DeudaVda - datosCliente[j].DeudaVda);
						}else{
							deuda += parseFloat(datosCliente[j-1].DeudaVda - datosCliente[j].DeudaVda);
						}
						deudaExistente = datosCliente[j].DeudaVda;
						datosCliente[j].DeudaVda = deuda;
						datos_pago_parcial.push(datosCliente[j]);
						dias = parseInt(datosCliente[j].Dias);
					}
				}
			}
			var consolidados = consolidar(mesEntero(datos_pago_parcial, discAnios[r].item, discMeses[s].item, 1));
			datos_pago_parcial_consolidado.push(consolidados);
		}
	}
}

function inicializarDatos(){
	datos_limpios = [];
	quitarLegales();
	quitarRegistrosTotal();
	quitarDeudoresVarios();
	cargarFiltros();
	quitarCasosCerradosPorMes(datos_limpios, anioFiltro, mesFiltro);
}

function quitarCasosCerradosPorMes(jsonData){
	var discMeses = Distinct(jsonData.map(c => parseInt(c.Dia.split('/')[1])));
	var discAnios = Distinct(jsonData.map(c => parseInt(c.Dia.split('/')[2])));
	var maxDate = [];
	
	for (let i = 0; i < discAnios.length; i++) {
		for (let j = 0; j < discMeses.length; j++) {
			var datos = mesEntero(jsonData, discAnios[i].item, discMeses[j].item, 1);
			datos = consolidar(datos);
			datos = ordenar(datos);
			var maxDia = getMaxDate(datos.map(c => c.Dia), discMeses[j].item, discAnios[i].item);
			var cerrados = $.grep(datos, function (dato) { return new Date(dato.Dia.split('/')[1] + '/' + dato.Dia.split('/')[0] + '/' + dato.Dia.split('/')[2]) < new Date(maxDia.split('/')[1] + '/' + maxDia.split('/')[0] + '/' + maxDia.split('/')[2])});
			cerrados = compararCerradosVsLegales(cerrados, discAnios[i], discMeses[j])
			cerrados.forEach(function(elem){
				datos_casos_cerrados.push(elem);
			})
		}
	}
	
	datos = jsonData;
	var clientes = distinctByNroCliente(datos);
	var dias = Distinct(datos.map(c => c.Dia));
	var dia = [];
	for (let x=0; x < dias.length; x++){
		dia.push(dias[x].item);
	}
	datos = ordenar(datos);
	for (let k = 0; k < clientes.length; k++){
		var registros = $.grep(datos, function(item){return item.NroCliente == clientes[k].item.NroCliente});
		
		for (let l = 0; l < registros.length; l++){
			if (registros[l+1] != undefined){
				if (parseInt(dia.indexOf(registros[l+1].Dia) - dia.indexOf(registros[l].Dia)) > 1){
					datos_casos_cerrados.push(registros[l]);
				}
			}
		}
	}
	
	var mes = [];
	for (let i = 0; i < discAnios.length; i++) {
		for (let j = 0; j < discMeses.length; j++) {
			mes = mesEntero(datos_casos_cerrados, discAnios[i].item, discMeses[j].item, 1);
			compararCerradosVsVigentes(mes, discAnios[i].item, discMeses[j].item);
		}
	}
	//
}

function compararCerradosVsLegales(jsonCerrados, anio, mes){
	// Obtengo el mes a comparar del original consolidado de legales
	var legales = $.grep(datos_originales_legales_consolidados, function (dato) { return parseInt(dato.Dia.split('/')[2]) == anio.item && parseInt(dato.Dia.split('/')[1]) == mes.item});
	var interseccion = [];
	legales.forEach(function (item) {
		if (jsonCerrados.map(function(e) { return parseInt(e.NroCliente) }).indexOf(parseInt(item.NroCliente.split('*')[1])) != -1){;
			interseccion.push(item);
		}
	});
	let keys = Object.keys(jsonCerrados);

	interseccion.forEach(function (item) {
		var index = jsonCerrados.map(function(e) { return parseInt(e.NroCliente) }).indexOf(parseInt(item.NroCliente.split('*')[1]));	
		jsonCerrados.splice(index,1);
		datos_originales_legales_consolidados.push(item);
	});
	return jsonCerrados;
}

function compararCerradosVSParciales(){
	var discMeses = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[1])));
	var discAnios = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[2]))); 
	var datosCerrados = datos_casos_cerrados;
	var datosPagosParciales = datos_pago_parcial_consolidado;
	var interseccion = [];
	console.log(datos_pago_parcial.length);
	
	for (let i = 0; i < discAnios.length; i++) {
		for (let j = 0; j < discMeses.length; j++) {
			var cerrados = mesEntero(datosCerrados, discAnios[i].item, discMeses[j].item, 1);
			var pagoParcial = consolidar(mesEntero(datosPagosParciales, discAnios[i].item,  discMeses[j].item, 1));
			pagoParcial.forEach(function (item) {
				if (cerrados.map(function(e) { return parseInt(e.NroCliente) }).indexOf(parseInt(item.NroCliente)) != -1){
					
					var index = datos_pago_parcial.map(function(e) { return parseInt(e.NroCliente) }).indexOf(parseInt(item.NroCliente));	
					datos_pago_parcial.splice(index,1);
				}
			});
		}
	}
}

function compararCerradosVsVigentes(jsonCerrados, anio, mes){
	// Obtengo el mes a comparar del original consolidado de cerrados
	var limpios = [];
	limpios = consolidar($.grep(datos_limpios, function(item){return parseInt(item.Dia.split('/')[2]) == anio && parseInt(item.Dia.split('/')[1]) == mes}));
	limpios = $.grep(limpios, function (dato) { return parseInt(dato.Dia.split('/')[2]) == anio && parseInt(dato.Dia.split('/')[1]) == mes});
	
	var interseccion = [];
	limpios.forEach(function (item) {
		if (jsonCerrados.map(function(e) { return e.NroCliente }).indexOf(item.NroCliente) == -1){;
			interseccion.push(item);
		}
	});
	interseccion.forEach(function(elem){
		datos_vigentes_consolidados.push(elem);
	})
}

function quitarDeudoresVarios(){
	// Ordeno por Dias de Mora de mayor a menor y me quedo con el caso con el nro más alto
	datos_deudores_varios = $.grep(datos_limpios, function (dato) { return parseInt(dato.DeudaVda) <= parseInt(maxDeudoresVarios) });
	datos_limpios = $.grep(datos_limpios, function (dato) { return parseInt(dato.DeudaVda) >  parseInt(maxDeudoresVarios) });
	datos_deudores_varios = datos_deudores_varios.sort(function (a, b) { return parseInt(b.Dia) - parseInt(a.Dia); });
}

function inicializoCampos(){
	// obtengo la fecha de hoy para setear el mes actual automáticamente
	var fechaHoy = new Date();
	var mesActual = fechaHoy.getMonth();
	$("#dlMes").val(mesActual);
}

// Limpio los registros que pasaron a Legales (empiezan con *)
function quitarLegales() {
	// Elimino los registros que comienzan con '*'
    datos_originales_legales = $.grep(datos_originales, function (dato) { return dato.NroCliente.startsWith("*") });
    // Voy almacenando los datos que quedan en una variable nueva
	datos_limpios = $.grep(datos_originales, function (dato) { return !dato.NroCliente.startsWith("*") });
	// Datos legales consolidados (ordenados por Dia de procesamiento y agrupados por NroCliente)
	datos_originales_legales_consolidados = datos_originales_legales.sort(function (a, b) { return parseInt(b.Dia.split('/')[0]) - parseInt(a.Dia.split('/')[0]); });
	datos_originales_legales_consolidados = datos_originales_legales.filter((data, index, self) => index === self.findIndex((t) => (t.save === data.save && t.NroCliente === data.NroCliente)))

	calcularLegalesNuevos();
}

function calcularLegalesNuevos(){
	var discMeses = Distinct(datos_originales_legales.map(c => parseInt(c.Dia.split('/')[1])));
	var discAnios = Distinct(datos_originales_legales.map(c => parseInt(c.Dia.split('/')[2])));
	var mes1 = [];
	var mes2 = [];

	for (let i = 0; i < discAnios.length; i++) {
		for (let j = 0; j < discMeses.length; j++) {
			mes1 = mesEntero(datos_originales_legales, discAnios[i].item, discMeses[j].item, 1);
			mes1 = consolidar(mes1);
			mes1 = ordenar(mes1);
			
			mes2 = mesEntero(datos_originales_legales, discAnios[i].item, discMeses[j].item, 2);
			mes2 = consolidar(mes2);
			mes2 = ordenar(mes2);
			
			var interseccion = [];
			mes2.forEach(function (item) {
				if (mes1.map(function(e) { return e.NroCliente }).indexOf(item.NroCliente) == -1){;
					interseccion.push(item);
				}
			});
			interseccion.forEach(function(elem){
				datos_legales_nuevos.push(elem);
			})
		}
	}
}

function ordenar(jsonData){
	var output = [];
	output = jsonData.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	return output;
}

function ordenarDesc(jsonData){
	var output = [];
	output = jsonData.sort(function(a,b){return new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )-new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )});
	return output;
}

function mesEntero(jsonData, anio, mes, mesNro){
	if (mesNro == 1){
		if (mes == 12){
			var dia1 = primerDiaHabilMes(anio, mes, 0);
			var dia2 = primerDiaHabilMes(anio + 1, 1, 0);
						
			return $.grep(jsonData, function (item){
				return (item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes && item.Dia.split('/')[0] > dia1)
					|| (item.Dia.split('/')[2] == parseInt(anio + 1) && item.Dia.split('/')[1] == 1 && item.Dia.split('/')[0] == dia2)
			})
		}else{
			var dia1 = primerDiaHabilMes(anio, mes, 0);
			var dia2 = primerDiaHabilMes(anio, mes + 1, 0);
			
			return $.grep(jsonData, function (item){
				return (item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes && item.Dia.split('/')[0] > dia1)
					|| (item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes + 1 && item.Dia.split('/')[0] == dia2)
			})
		}
	}else{
		if (mes == 12){
			var dia1 = primerDiaHabilMes(anio + 1, 1, 0);
			var dia2 = primerDiaHabilMes(anio + 1, 2, 0);
						
			return $.grep(jsonData, function (item){
				return (item.Dia.split('/')[2] == parseInt(anio + 1) && item.Dia.split('/')[1] == 1 && item.Dia.split('/')[0] > dia1)
					|| (item.Dia.split('/')[2] == parseInt(anio + 1) && item.Dia.split('/')[1] == 2 + 1 && item.Dia.split('/')[0] == dia2)
			})
		}else{
			var dia1 = primerDiaHabilMes(anio, mes + 1, 0);
			var dia2 = primerDiaHabilMes(anio, mes + 2, 0);
			
			return $.grep(jsonData, function (item){
				return (item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes + 1 && item.Dia.split('/')[0] > dia1)
					|| (item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes + 2 && item.Dia.split('/')[0] == dia2)
			})
		}
	}
}

// Limpio los registros que totalizan en el original
function quitarRegistrosTotal(){
    datos_limpios = $.grep(datos_limpios, function (dato) { return !dato.NroCliente.startsWith("*") && !isNaN(dato.NroCliente)});
	console.log(datos_limpios);
}

function primerDiaHabilMes(anio, mes, diaNro){
	var dia = $.grep(datos_limpios, function(item){return item.Dia.split('/')[2] == anio && item.Dia.split('/')[1] == mes});
	dia = Distinct(dia.map(c => c.Dia));
	if (dia[diaNro] != undefined){
		return parseInt(dia[diaNro].item.split('/')[0]);
	}else
	{
		return 0;
	}
}

function cargarFiltros() {
    automcompleteFiltro(datos_limpios.map(c => c.NroCliente), "NroCliente");
    automcompleteFiltro(datos_limpios.map(c => c.ApellidoNombre), "ApellidoNombre");
    automcompleteFiltro(datos_limpios.map(c => c.Operador), "Operador");
}

function automcompleteFiltro(jsonData, columna){
	let list = [];
	switch(columna) {
		case "NroCliente":
			jsonData = $.grep(jsonData, function (n, i) { return jsonData.indexOf(n) == i; }).sort();
			list = document.getElementById('dlNroCliente');
			jsonData.forEach(function (item) {
				var option = document.createElement('option');
				option.value = item;
				list.appendChild(option);
			});
			break;
		case "ApellidoNombre":
		    jsonData = $.grep(jsonData, function (n, i) { return jsonData.indexOf(n) == i; }).sort();
			list = document.getElementById('dlApellido');
			jsonData.forEach(function (item) {
				var option = document.createElement('option');
				option.value = item;
				list.appendChild(option);
			});
			break;
		case "Operador":
			jsonData = $.grep(jsonData, function (n, i) { return jsonData.indexOf(n) == i; }).sort();
			jsonData = $.grep(jsonData, function (dato) { return dato != null });
			list = document.getElementById('dlOperador');

			var sin_operador = document.createElement('option');
			sin_operador.value = cte_sin_operador;
			list.appendChild(sin_operador)

			jsonData.forEach(function (item) {
				var option = document.createElement('option');
				option.value = item;
				list.appendChild(option);
			});
			break;
		default:
		// code block
	}
}

function visualizar() {
	mesFiltro = parseInt($('#dlMes option:selected' ).val());
	anioFiltro = parseInt($('#dlAnio option:selected' ).val());
	
    var datosFiltrados = datos_limpios;
	datosFiltrados = consolidar(datosFiltrados);
	datosFiltrados = JSON.parse(JSON.stringify(datosFiltrados).replace(/"\s+|\s+"/g,'"'));

    if ($('#txtNroCliente').val() != '') {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.NroCliente == $("#txtNroCliente").val() });
    }
    if ($('#txtApellido').val() != '') {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.ApellidoNombre == $("#txtApellido").val() });
    }
    if ($('#txtOperador').val() != '') {
        if ($('#txtOperador').val() == cte_sin_operador) {
            datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Operador == "" });
        } else {
            datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Operador == $("#txtOperador").val().trim() });
        }
    }
    if ($("#txtDias1").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Dias >= $("#txtDias1").val() });
    }
    if ($("#txtDias2").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Dias <= $("#txtDias2").val() });
    }
    if ($("#txtDias1").val() > 0 && $("#txtDias2").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Dias >= $("#txtDias1").val() && dato.Dias <= $("#txtDias2").val() });
    }
    if ($("#txtMora1").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.DeudaVda >= parseInt($("#txtMora1").val()) });
    }
    if ($("#txtMora2").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.DeudaVda <= parseInt($("#txtMora2").val()) });
    }
    if ($("#txtMora1").val() > 0 && $("#txtMora2").val() > 0) {
        datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.DeudaVda >= parseInt($("#txtMora1").val()) && dato.DeudaVda <= parseInt($("#txtMora2").val()) });
    }
	datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Dia.split("/")[1] == mesFiltro });
	datosFiltrados = $.grep(datosFiltrados, function (dato) { return dato.Dia.split("/")[2] == anioFiltro });
   	
	var rowNum = 0;

    $("#jsGrid").jsGrid({
        width: "98%",

        sorting: true,
        paging: true,

        data: datosFiltrados,
		
        fields: [
            { name: "NroCliente", type: "text", align: "center" },
            { name: "ApellidoNombre", type: "text", align: "center" },
            { name: "CUIT", type: "number", align: "center" },
            { name: "Dias", type: "number", align: "center" },
            { name: "ProxGestion", type: "date", align: "center" },
            { name: "DeudaVda", type: "number", align: "center" },
            { name: "Operador", type: "string", align: "center" },
			{ name: "Dia", type: "string", align: "center" }
        ]
    });
	datosFiltrados = datos_limpios;
}

function consolidar(datosFiltrados) {
	// Ordeno por día de mayor a menor y me quedo con el caso con el nro más alto.
	datosFiltrados = ordenarDesc(datosFiltrados);
	datosFiltrados = datosFiltrados.filter((data, index, self) => index === self.findIndex((t) => (t.save === data.save && t.NroCliente === data.NroCliente)))
	datos_consolidados = datosFiltrados;
    return datosFiltrados;

}
function consolidarMora(datosFiltrados) {
	// Ordeno por día de mayor a menor y me quedo con el caso con el nro más alto.
	datosFiltrados = datosFiltrados.sort(function (a, b) { return b.Dias - a.Dias});
	datosFiltrados = $.grep(datosFiltrados, function(item){return item.Dias > 3});
	datosFiltrados = datosFiltrados.filter((data, index, self) => index === self.findIndex((t) => (t.save === data.save && t.NroCliente === data.NroCliente)))
	datos_consolidados = datosFiltrados;
    return datosFiltrados;
}

// Tabs
function openCity(evt, cityName) {
    var i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    document.getElementById(cityName).style.display = "block";
    evt.currentTarget.className += " active";
	
	if(cityName == "Datos"){
		visualizar();
	}
	if(cityName == "Graficos"){
		graficar();
	}
	if(cityName == "Reportes"){
		reporting();
	}
	if(cityName == "Parametria"){
		parametria();
	}
	if(cityName == "Tablas"){
		tablas();
	}
}

function tablas(){
	document.getElementById("Tablas").innerHTML = "";
	var html = "<table style='font-size: 11px'><tr><th rowspan='2'>Mes</th><th rowspan='2'>Operador</th><th colspan='4'>Cerrados</th><th colspan='4'>Parciales</th><th colspan='4'>Pendientes</th><th colspan='4'>A Legales</th><th colspan='2'>Totales</th></tr>"
	html += "<tr><td>Cant.</td><td>%</td><td>Monto</td><td>%</td><td>Cant.</td><td>%</td><td>Monto</td><td>%</td><td>Cant.</td><td>%</td><td>Monto</td><td>%</td><td>Cant.</td><td>%</td><td>Monto</td><td>%</td><td>Cant</td><td>Monto</td></tr>"
	
	var anios = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[2])));
	var meses = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[1])));
	anios = anios.reverse();
	meses = meses.reverse();
	
	
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			var cerrados = mesEntero(datos_casos_cerrados, anios[i].item, meses[j].item, 1);
			var parciales = mesEntero(datos_pago_parcial, anios[i].item, meses[j].item, 1);
			var pendientes = mesEntero(datos_vigentes_consolidados, anios[i].item, meses[j].item, 1);
			var aLegales = mesEntero(consolidar(datos_legales_nuevos), anios[i].item, meses[j].item, 1);
			var totalCerrados = $.grep(cerrados, function (dato) { return dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item && dato.DeudaVda > maxDeudoresVarios});
			var totalParciales = $.grep(parciales, function (dato) { return dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item && dato.DeudaVda > maxDeudoresVarios});
			var totalVigentes = $.grep(pendientes, function (dato) { return dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item && dato.DeudaVda > maxDeudoresVarios});
			var totalALegales = $.grep(aLegales, function (dato) { return dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item && dato.DeudaVda > maxDeudoresVarios});
			
			cerradosCant = 0; cerradosCantPorc = 0;
			cerradosMonto = 0; cerradosMontoPorc = 0;
			parcialCant = 0; parcialCantPorc = 0;
			parcialMonto = 0; parcialMontoPorc = 0;
			pendientesCant = 0; pendientesCantPorc = 0;
			pendientesMonto = 0; pendientesMontoPorc = 0;
			aLegalesCant = 0; aLegalesCantPorc = 0;
			aLegalesMonto = 0; aLegalesMontoPorc = 0;
			
			html += "<tr><td rowspan='3' style='border-top: solid 2px #555 !important;'>" + meses[j].item + "-" + anios[i].item + "</td><td  style='border-top: solid 2px #555 !important; padding-left: 1px'>Luisa</td>"
			var cerradosUsr = $.grep(cerrados, function (dato) { return dato.Operador.trim() == "LCABRERA"});
			html += "<td style='border-top: solid 2px #555 !important;'>" + cerradosUsr.length + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(cerradosUsr.length / totalCerrados.length * 100 )+ "%</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + dollarUSLocale.format(sum(cerradosUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var parcialesUsr = $.grep(parciales, function (dato) { return dato.Operador.trim() == "LCABRERA" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td style='border-top: solid 2px #555 !important;'>" + parcialesUsr.length + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(parcialesUsr.length / totalParciales.length * 100 )+ "%</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + dollarUSLocale.format(sum(parcialesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var pendientesUsr = $.grep(pendientes, function (dato) { return dato.Operador.trim() == "LCABRERA" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td style='border-top: solid 2px #555 !important;'>" + pendientesUsr.length + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(pendientesUsr.length / totalVigentes.length * 100 )+ "%</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + dollarUSLocale.format(sum(pendientesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var aLegalesUsr = $.grep(aLegales, function (dato) { return dato.Operador.trim() == "LCABRERA" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td style='border-top: solid 2px #555 !important;'style='border-top: solid 2px #555 !important;'>" + aLegalesUsr.length + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(aLegalesUsr.length / totalALegales.length * 100 )+ "%</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + dollarUSLocale.format(sum(aLegalesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			html += "<td style='border-top: solid 2px #555 !important;'>" + parseInt(cerradosUsr.length + parcialesUsr.length + pendientesUsr.length + aLegalesUsr.length) + "</td>";
			html += "<td style='border-top: solid 2px #555 !important;'>" + dollarUSLocale.format(parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) + sum(parcialesUsr.map(c => c.DeudaVda)) + sum(pendientesUsr.map(c => c.DeudaVda)) + sum(totalVigentes.map(c => c.DeudaVda)))) + "</td>";
			html += "</tr>";
			
			cerradosCant += cerradosUsr.length; cerradosCantPorc += parseInt(cerradosUsr.length / totalCerrados.length * 100);
			cerradosMonto += sum(cerradosUsr.map(c => c.DeudaVda)); cerradosMontoPorc += parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 );
			parcialCant += parcialesUsr.length; parcialCantPorc += parseInt(parcialesUsr.length / totalParciales.length * 100);
			parcialMonto += sum(parcialesUsr.map(c => c.DeudaVda)); parcialMontoPorc += parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 );
			pendientesCant += pendientesUsr.length; pendientesCantPorc += parseInt(pendientesUsr.length / totalVigentes.length * 100);
			pendientesMonto += sum(pendientesUsr.map(c => c.DeudaVda)); pendientesMontoPorc += parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 );
			aLegalesCant += aLegalesUsr.length; aLegalesCantPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			aLegalesMonto += sum(aLegalesUsr.map(c => c.DeudaVda)); aLegalesMontoPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			
			html += "<tr><td>Natalia</td>"
			var cerradosUsr = $.grep(cerrados, function (dato) { return dato.Operador.trim() == "ngordillo" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + cerradosUsr.length + "</td>"
			html += "<td>" + parseInt(cerradosUsr.length / totalCerrados.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(cerradosUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var parcialesUsr = $.grep(parciales, function (dato) { return dato.Operador.trim() == "ngordillo" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + parcialesUsr.length + "</td>"
			html += "<td>" + parseInt(parcialesUsr.length / totalParciales.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(parcialesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var pendientesUsr = $.grep(pendientes, function (dato) { return dato.Operador.trim() == "ngordillo" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + pendientesUsr.length + "</td>"
			html += "<td>" + parseInt(pendientesUsr.length / totalVigentes.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(pendientesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var aLegalesUsr = $.grep(aLegales, function (dato) { return dato.Operador.trim() == "ngordillo" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + aLegalesUsr.length + "</td>"
			html += "<td>" + parseInt(aLegalesUsr.length / totalALegales.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(aLegalesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			html += "<td>" + parseInt(cerradosUsr.length + parcialesUsr.length + pendientesUsr.length + aLegalesUsr.length) + "</td>";
			html += "<td>" + dollarUSLocale.format(parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) + sum(parcialesUsr.map(c => c.DeudaVda)) + sum(pendientesUsr.map(c => c.DeudaVda)) + sum(totalVigentes.map(c => c.DeudaVda)))) + "</td>";
			html += "</tr>";
			
			cerradosCant += cerradosUsr.length; cerradosCantPorc += parseInt(cerradosUsr.length / totalCerrados.length * 100);
			cerradosMonto += sum(cerradosUsr.map(c => c.DeudaVda)); cerradosMontoPorc += parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 );
			parcialCant += parcialesUsr.length; parcialCantPorc += parseInt(parcialesUsr.length / totalParciales.length * 100);
			parcialMonto += sum(parcialesUsr.map(c => c.DeudaVda)); parcialMontoPorc += parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 );
			pendientesCant += pendientesUsr.length; pendientesCantPorc += parseInt(pendientesUsr.length / totalVigentes.length * 100);
			pendientesMonto += sum(pendientesUsr.map(c => c.DeudaVda)); pendientesMontoPorc += parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 );
			aLegalesCant += aLegalesUsr.length; aLegalesCantPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			aLegalesMonto += sum(aLegalesUsr.map(c => c.DeudaVda)); aLegalesMontoPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			
			html += "<tr><td>Carlos</td>"
			var cerradosUsr = $.grep(cerrados, function (dato) { return dato.Operador.trim() == "cferretti" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + cerradosUsr.length + "</td>"
			html += "<td>" + parseInt(cerradosUsr.length / totalCerrados.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(cerradosUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var parcialesUsr = $.grep(parciales, function (dato) { return dato.Operador.trim() == "cferretti" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + parcialesUsr.length + "</td>"
			html += "<td>" + parseInt(parcialesUsr.length / totalParciales.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(parcialesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var pendientesUsr = $.grep(pendientes, function (dato) { return dato.Operador.trim() == "cferretti" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + pendientesUsr.length + "</td>"
			html += "<td>" + parseInt(pendientesUsr.length / totalVigentes.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(pendientesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			var aLegalesUsr = $.grep(aLegales, function (dato) { return dato.Operador.trim() == "cferretti" && dato.Dia.split('/')[2] == anios[i].item && dato.Dia.split('/')[1] == meses[j].item});
			html += "<td>" + aLegalesUsr.length + "</td>"
			html += "<td>" + parseInt(aLegalesUsr.length / totalALegales.length * 100 )+ "%</td>"
			html += "<td>" + dollarUSLocale.format(sum(aLegalesUsr.map(c => c.DeudaVda))) + "</td>"
			html += "<td>" + parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100 )+ "%</td>"
			html += "<td>" + parseInt(cerradosUsr.length + parcialesUsr.length + pendientesUsr.length + aLegalesUsr.length) + "</td>";
			html += "<td>" + dollarUSLocale.format(parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) + sum(parcialesUsr.map(c => c.DeudaVda)) + sum(pendientesUsr.map(c => c.DeudaVda)) + sum(totalVigentes.map(c => c.DeudaVda)))) + "</td>";
			html += "</tr>";
			
			cerradosCant += cerradosUsr.length; cerradosCantPorc += parseInt(cerradosUsr.length / totalCerrados.length * 100);
			cerradosMonto += sum(cerradosUsr.map(c => c.DeudaVda)); cerradosMontoPorc += parseInt(sum(cerradosUsr.map(c => c.DeudaVda)) / sum(totalCerrados.map(c => c.DeudaVda)) * 100 );
			parcialCant += parcialesUsr.length; parcialCantPorc += parseInt(parcialesUsr.length / totalParciales.length * 100);
			parcialMonto += sum(parcialesUsr.map(c => c.DeudaVda)); parcialMontoPorc += parseInt(sum(parcialesUsr.map(c => c.DeudaVda)) / sum(totalParciales.map(c => c.DeudaVda)) * 100 );
			pendientesCant += pendientesUsr.length; pendientesCantPorc += parseInt(pendientesUsr.length / totalVigentes.length * 100);
			pendientesMonto += sum(pendientesUsr.map(c => c.DeudaVda)); pendientesMontoPorc += parseInt(sum(pendientesUsr.map(c => c.DeudaVda)) / sum(totalVigentes.map(c => c.DeudaVda)) * 100 );
			aLegalesCant += aLegalesUsr.length; aLegalesCantPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			aLegalesMonto += sum(aLegalesUsr.map(c => c.DeudaVda)); aLegalesMontoPorc += parseInt(sum(aLegalesUsr.map(c => c.DeudaVda)) / sum(totalALegales.map(c => c.DeudaVda)) * 100);
			
			html += "<tr><td style='border-top: solid 1px #555 !important;'>Parciales</td><td style='border-top: solid 1px #555 !important;'></td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + cerradosCant + "</td><td style='border-top: solid 1px #555 !important;'>" + cerradosCantPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + dollarUSLocale.format(cerradosMonto) + "</td><td style='border-top: solid 1px #555 !important;'>" + cerradosMontoPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + parcialCant + "</td><td style='border-top: solid 1px #555 !important;'>" + parcialCantPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + dollarUSLocale.format(parcialMonto) + "</td><td style='border-top: solid 1px #555 !important;'>" + parcialMontoPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + pendientesCant + "</td><td style='border-top: solid 1px #555 !important;'>" + pendientesCantPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + dollarUSLocale.format(pendientesMonto) + "</td><td style='border-top: solid 1px #555 !important;'>" + pendientesMontoPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + aLegalesCant + "</td><td style='border-top: solid 1px #555 !important;'>" + aLegalesCantPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'>" + dollarUSLocale.format(aLegalesMonto) + "</td><td style='border-top: solid 1px #555 !important;'>" + aLegalesMontoPorc + "%</td>";
			html += "<td style='border-top: solid 1px #555 !important;'></td><td style='border-top: solid 1px #555 !important;'></td></tr>";
		}
	}
	html += "</table>"
	document.getElementById("Tablas").innerHTML = document.getElementById("Tablas").innerHTML + html;
}

function parametria(){
	$('#txtDeudoresVariosMax').val(maxDeudoresVarios);
}

function aplicarParams(){
	maxDeudoresVarios = $('#txtDeudoresVariosMax').val();
	inicializarDatos();
}

function graficar(){
	// Ordeno las fuentes de gráficos por fecha
	datos_casos_cerrados = datos_casos_cerrados.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	datos_deudores_varios = datos_deudores_varios.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	datos_originales_legales = datos_originales_legales.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	datos_limpios = datos_limpios.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )})	;
	datos_pago_parcial = datos_pago_parcial.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});	
	datos_vigentes_limpios = datos_pago_parcial.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	datos_originales_legales = datos_originales_legales.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	
	operadoresCantidad('container4', "Cantidad Asignada por Analista", "count");
	operadoresCantidad('container5', "Deuda Asignada por Analista", "suma");
	columnas('Cantidad por Meses','container7',"count",'Cantidad de Solicitudes');
	columnas('Deuda por Meses','container8',"suma",'Deuda en Pesos');
	deudaSegmentos("container6", "Deuda por Segmentos", datosDeuda("suma"));
	deudaSegmentos("container9", "Cantidad por Segmentos", datosDeuda("count"));
	deudaSegmentos("container10", "Deuda en Legales", datosLegales("Deuda en Legales","suma"));
	deudaSegmentos("container11", "Operaciones en Legales", datosLegales("Operaciones en Legales","count"));
}

function columnas(nombre, container, opp, y){
	Highcharts.chart(container, {
    chart: {
        type: 'column'
    },
    title: {
        text: nombre
    },
    xAxis: {
        categories: categorias()
    },
    yAxis: {
        min: 0,
        title: {
            text: y
        },
        stackLabels: {
            enabled: true,
            style: {
                fontWeight: 'bold',
                color: ( // theme
                    Highcharts.defaultOptions.title.style &&
                    Highcharts.defaultOptions.title.style.color
                ) || 'gray'
            }
        }
    },
    legend: {
        align: 'right',
        x: -30,
        verticalAlign: 'top',
        y: 25,
        floating: true,
        backgroundColor:
            Highcharts.defaultOptions.legend.backgroundColor || 'white',
        borderColor: '#CCC',
        borderWidth: 1,
        shadow: false
    },
    tooltip: {
        headerFormat: '<b>{point.x}</b><br/>',
        pointFormat: '{series.name}: {point.y}<br/>Total: {point.stackTotal}'
    },
    plotOptions: {
        column: {
            stacking: 'normal',
            dataLabels: {
                enabled: true
            }
        }
    },
    series: datosColumas(opp)
});
}

function datosColumas(opp){
	var obj1 = new Object();
	var p = [];
	obj1.name = "Cerrados";
	
	var array = [];
	var anios = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[2])));
	var meses = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[1])));
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			array.push((GroupByMonth($.grep(datos_casos_cerrados,function(item){return item.Dia.split('/')[2] == anios[i].item && item.Dia.split('/')[1] == meses[j].item}),opp)));
		}
	}
	obj1.data = array;
	p.push(obj1);
	
	var obj2 = new Object();
	array = [];
	obj2.name = "Vigentes";
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			array.push(sum(GroupBy($.grep(datos_vigentes_consolidados,function(item){return item.Dia.split('/')[2] == anios[i].item && item.Dia.split('/')[1] == meses[j].item && item.Dias > 3}),opp)));
		}
	}
	obj2.data = array;
	p.push(obj2);
	
	var obj3 = new Object();
	array = [];
	obj3.name = "Legales";
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			array.push((GroupByMonth(consolidar($.grep(datos_originales_legales,function(item){return item.Dia.split('/')[2] == anios[i].item && item.Dia.split('/')[1] == meses[j].item})),opp)));
		}
	}
	obj3.data = array;
	p.push(obj3);
	
	var obj4 = new Object();
	array = [];
	obj4.name = "Varios";
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			array.push((GroupByMonth(consolidar($.grep(datos_deudores_varios,function(item){return item.Dia.split('/')[2] == anios[i].item && item.Dia.split('/')[1] == meses[j].item})),opp)));
		}
	}
	obj4.data = array;
	p.push(obj4);
	
	var obj5 = new Object();
	array = [];
	obj5.name = "Pagos Parciales";
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			array.push(sum(GroupBy($.grep(datos_pago_parcial,function(item){return item.Dia.split('/')[2] == anios[i].item && item.Dia.split('/')[1] == meses[j].item}), opp)))
		}
	}
	obj5.data = array;
	p.push(obj5);
	
	return p;
}

function categorias(){
	var anios = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[2])));
	var meses = Distinct(datos_limpios.map(c => parseInt(c.Dia.split('/')[1])));
	var categorias = [];
	
	for(i = 0; i < anios.length; i++){
		for(j = 0; j < meses.length; j++){
			categorias.push(meses[j].item + "-" + anios[i].item);
		}
	}
	return categorias;
}

function deudaSegmentos(container, titulo, datos){
	Highcharts.stockChart(container, {

        rangeSelector: {
            selected: 4
        },
		
		title: {
            text: titulo
        },

        yAxis: {
            labels: {

            },
            plotLines: [{
                value: 0,
                width: 2,
                color: 'silver'
            }]
        },

        plotOptions: {
            series: {
                showInNavigator: true
            }
        },

        tooltip: {
            pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b><br/>',
            valueDecimals: 0,
            split: true
        },

        series: datos
    });
}

function datosLegales(nombre, opp){
	var padre = [];
	
	var array1 = GroupByGraph(datos_originales_legales, opp);
	var objeto1 = {"name": nombre, "data": array1};
	padre.push(objeto1);

	return padre;
}

function datosDeuda(opp){
	var padre = [];
	
	var array1 = GroupByGraph($.grep(datos_limpios, function (dato) { return parseInt(dato.Dias) <= 30 && dato.Dias > 3}), opp);
	var objeto1 = {"name": "Deuda Temprana", "data": array1};
	var array2 = GroupByGraph($.grep(datos_limpios, function (dato) { return parseInt(dato.Dias) > 30 && parseInt(dato.Dias) <= 60 }), opp);
	var objeto2 = {"name": "Deuda Intermedia","data": array2};
	var array3 = GroupByGraph($.grep(datos_limpios, function (dato) { return parseInt(dato.Dias) > 60}), opp);
	var objeto3 = {"name": "Deuda Tardía","data": array3};
	padre.push(objeto1);
	padre.push(objeto2);
	padre.push(objeto3);

	return padre;
}

function operadoresCantidad(container, titulo, opp){
     Highcharts.stockChart(container, {

        rangeSelector: {
            selected: 4
        },
		
		title: {
            text: titulo
        },

        yAxis: {
            labels: {

            },
            plotLines: [{
                value: 0,
                width: 2,
                color: 'silver'
            }]
        },

        plotOptions: {
            series: {
                showInNavigator: true
            }
        },

        tooltip: {
            pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b><br/>',
            valueDecimals: 0,
            split: true
        },

        series: datosOperadores(opp)
    });
}

function datosOperadores(opp){
	var padre = [];

	var array1 = GroupByGraph($.grep(datos_originales, function (dato) { return dato.Operador.trim() == "LCABRERA" }), opp);
	var objeto1 = {"name": "Luisa", "data": array1};
	var array2 = GroupByGraph($.grep(datos_originales, function (dato) { return dato.Operador.trim() == "ngordillo" }), opp);
	var objeto2 = {"name": "Natalia","data": array2};
	var array3 = GroupByGraph($.grep(datos_originales, function (dato) { return dato.Operador.trim() == "cferretti" }), opp);
	var objeto3 = {"name": "Carlos","data": array3};
	padre.push(objeto1);
	padre.push(objeto2);
	padre.push(objeto3);

	return padre;
}

function dibujarGrilla(nombre, datos){
	$(nombre).jsGrid({
        width: "98%",

        sorting: true,
        paging: true,

        data: datos,

        fields: [
            { name: "NroCliente", type: "text", align: "center" },
            { name: "ApellidoNombre", type: "text", align: "center" },
            { name: "CUIT", type: "number", align: "center" },
            { name: "Dias", type: "number", align: "center" },
            { name: "ProxGestion", type: "date", align: "center" },
            { name: "DeudaVda", type: "number", align: "center"},
            { name: "Operador", type: "string", align: "center" },
			{ name: "Dia", type: "date", align: "center" },
        ]
    });
}

function reporting(){
	var html = "";
	document.getElementById("Reportes").innerHTML = "";
	
	var deudoresVarios = consolidar($.grep(datos_deudores_varios, function(item){return item.Dia.split('/')[2] == anioFiltro && item.Dia.split('/')[1] == mesFiltro}));
	var deudoresLegales = consolidar($.grep(datos_originales_legales, function(item){return item.Dia.split('/')[2] == anioFiltro && item.Dia.split('/')[1] == mesFiltro}));
	var casosCerrados = $.grep(datos_casos_cerrados, function(item){return item.Dia.split('/')[2] == anioFiltro && item.Dia.split('/')[1] == mesFiltro});
	var pagosParciales = $.grep(datos_pago_parcial, function(item){return item.Dia.split('/')[2] == anioFiltro && item.Dia.split('/')[1] == mesFiltro});
	var casosVigentes = $.grep(datos_vigentes_consolidados, function(item){return item.Dia.split('/')[2] == anioFiltro && item.Dia.split('/')[1] == mesFiltro});
	
	// Elimino de los datos vigentes aquellos con menos de 3 días de mora
	casosVigentes = $.grep(casosVigentes, function (item){return item.Dias > 3});
	
	var reportes = datos_originales;
	var totalCasos = parseInt(deudoresVarios.length + casosCerrados.length + casosVigentes.length);
	var totalDeuda = parseInt(sum(GroupBy(deudoresVarios,"suma")) + sum(GroupBy(casosCerrados,"suma")) + sum(GroupBy(pagosParciales, "suma")) + sum(GroupBy(casosVigentes, "suma")));
	var totalDeudaLimpia = consolidar(datos_limpios);
	
	nombre = 'Reporte ' + $('#dlMes option:selected' ).text() + " " + $('#dlAnio option:selected' ).text();
	html += "<h4>" + nombre + "</h4>";
	
	// Total Casos
	html += "<button type='button' class='collapsible' onclick='collapse(event)'>Por Cantidad (" + totalCasos + ")</button><div class='content'>"
	
	// Total Deudores Varios + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deudores Varios (" + deudoresVarios.length + " - " + parseInt(deudoresVarios.length / totalCasos * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridDeudoresVarios'></div></div>"
	
	// Total Pendientes + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Casos Pendientes (" + casosVigentes.length + " - " + parseInt(casosVigentes.length / totalCasos * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridPendientes'></div></div>"
	
	// Total Pagos Parciales + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Pagos Parciales (" + pagosParciales.length + " - " + parseInt(pagosParciales.length / totalCasos * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridParciales'></div></div>"
	
	// Total Cerrados + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Casos Cerrados (" + casosCerrados.length + " - " + parseInt(casosCerrados.length /totalCasos * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridCerrados'></div></div></div>"

	// Deuda Vencida Total
	html += "<button type='button' class='collapsible' onclick='collapse(event)'>Por Deuda Vencida (" + dollarUSLocale.format(totalDeuda) + ")</button><div class='content'>"
	
	// Deuda Vencida Deudores Varios
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deudores Varios (" + dollarUSLocale.format(sum(GroupBy(deudoresVarios,"suma"))) + " - " + parseInt(sum(GroupBy(deudoresVarios,"suma")) /totalDeuda * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridDeudoresVarios2'></div></div>"
	
	// Deuda Vencida Cerrados + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deuda Pendiente (" + dollarUSLocale.format(sum(GroupBy(casosVigentes,"suma"))) + " - " + parseInt(sum(GroupBy(casosVigentes,"suma")) /totalDeuda * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridPendientes2'></div></div>"

	// Deuda Pagos Parciales + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deuda Pagos Parciales (" + dollarUSLocale.format(sum(GroupBy(pagosParciales,"suma"))) + " - " + parseInt(sum(GroupBy(pagosParciales,"suma")) /totalDeuda * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridParciales2'></div></div>"			

	// Deuda Vencida Pendiente + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deuda Cerrada (" + dollarUSLocale.format(sum(GroupBy(casosCerrados, "suma"))) + " - " + parseInt((sum(GroupBy(casosCerrados, "suma"))) / totalDeuda * 100) + "%)</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridCerrados2'></div></div></div>"
	
	// Legales
	html += "<button type='button' class='collapsible' onclick='collapse(event)'>Legales</button><div class='content'>"
	
	// Total Legales + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Casos en Legales (" + deudoresLegales.length  + ")</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridLegales'></div></div>"
	
	// Deuda Vencida Legales + Porcentaje
	html += "<button type='button' class='collapsible collapse' onclick='collapse(event)'>Deuda en Legales (" + dollarUSLocale.format(sum(GroupBy(deudoresLegales, "suma"))) + ")</button>"
	html += "<div class='content'><div style='margin: 10px; font-size:10pt;' id='jsGridLegales2'></div></div></div>"
	
	// Append del resultado al HTML
	document.getElementById("Reportes").innerHTML = document.getElementById("Reportes").innerHTML + html;
	
	dibujarGrilla("#jsGridDeudoresVarios", deudoresVarios);
	dibujarGrilla("#jsGridDeudoresVarios2", deudoresVarios);
	dibujarGrilla("#jsGridLegales", deudoresLegales);
	dibujarGrilla("#jsGridLegales2", deudoresLegales);
	dibujarGrilla("#jsGridPendientes", casosVigentes);
	dibujarGrilla("#jsGridPendientes2", casosVigentes);
	dibujarGrilla("#jsGridCerrados", casosCerrados);
	dibujarGrilla("#jsGridCerrados2", casosCerrados);
	dibujarGrilla("#jsGridParciales", pagosParciales);
	dibujarGrilla("#jsGridParciales2", pagosParciales);
}

function GroupBy(jsonData, opp){
	var groupedByDate = [];
	var padre = [];
	var hijo = [];
	var output = [];
	for (var key in jsonData) {
		var date = jsonData[key].Dia.trim();  
		if (!groupedByDate[date]) {
			groupedByDate[date] = [];
		}
		var dato = jsonData[key].DeudaVda;
		if (dato != undefined){
			groupedByDate[date].push(dato);
		}
	}
	Object.keys(groupedByDate).forEach(function(prop) {
	   padre = prop;
	   hijo = groupedByDate[prop].toString().split(',');
	   var operacion = 0;
	   if (opp == "suma"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += parseInt(hijo[i]);
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }else if(opp == "count"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += 1;
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }
	});
	return output;
}

function GroupByMonth(jsonData, opp){
	var groupedByMonth = [];
	var padre = [];
	var hijo = [];
	var output = [];
	for (var key in jsonData) {
		var date = jsonData[key].Dia.split('/')[1] + "-" + jsonData[key].Dia.split('/')[2];  
		if (!groupedByMonth[date]) {
			groupedByMonth[date] = [];
		}
		var dato = jsonData[key].DeudaVda;
		if (dato != undefined){
			dato = dato.toString().replace(",",".");
			groupedByMonth[date].push(dato);
		}
	}
	Object.keys(groupedByMonth).forEach(function(prop) {
	   padre = prop;
	   hijo = groupedByMonth[prop].toString().split(',');
	   var operacion = 0;
	   if (opp == "suma"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += parseInt(hijo[i]);
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }else if(opp == "count"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += 1;
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }
	});
	return parseInt(output);
}

function GroupByGraph(jsonData, opp){
	var groupedByDate = [];
	var padre = [];
	var hijo = [];
	var output = [];
	for (var key in jsonData) {
		var date = jsonData[key].Dia.trim();  
		if (!groupedByDate[date]) {
			groupedByDate[date] = [];
		}
		var dato = jsonData[key].DeudaVda;
		if (dato != undefined){
			dato = dato.toString().replace(",",".");
			groupedByDate[date].push(dato);
		}
	}
	var index = [];
	// build the index
	for (var x in groupedByDate) {
	   index.push(x);
	}
	
	Object.keys(groupedByDate).forEach(function(prop) {
	   padre = prop;
	   hijo = groupedByDate[prop].toString().split(',');
	   var operacion = 0;
	   if (opp == "suma"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += parseInt(hijo[i]);
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }else if(opp == "count"){
		   for (let i = 0; i < hijo.length; i++) {
			  operacion += 1;
			}
			if (!isNaN(operacion)){
				output.push(operacion);
			}
	   }
	});
	index = $.grep(index, function(item){return item =! undefined});
	
	var obj=[];
	
	for (i = 0; i < index.length; i++){
		var m = [];
		m[0] = new Date(index[i].split('/')[1] + "/" + index[i].split('/')[0] + "/" + index[i].split('/')[2]).getTime();
		m[1] = output[i];
		obj.push(m);
	}
	return obj;
}

function Distinct(data){
	const result = [];
	const map = new Map();
	for (const item of data) {
		if(!map.has(item)){
			map.set(item, true);
			result.push({
				item: item //parseInt(new Date(item).getFullYear()) + "-" + new Date(item).getMonth()
			});
		}
	}
	return result;
}
function distinctByNroCliente(data){
	const result = [];
	const map = new Map();
	for (const item of data) {
		if(!map.has(item.NroCliente)){
			map.set(item.NroCliente, true);
			result.push({
				item: item
			});
		}
	}
	return result;
}
function distinctByCliente(data){
	const result = [];
	const map = new Map();
	for (const item of data) {
		if(!map.has(item.NroCliente)){
			map.set(item.NroCliente, true);
			result.push({
				NroCliente: item.NroCliente,
				Dia: item.Dia
			});
		}
	}
	return result;
}
function distinctByOperador(data){
	const result = [];
	const map = new Map();
	for (const item of data) {
		if(!map.has(item.Operador)){
			map.set(item.Operador, true);
			result.push({
				Operador: item.Operador
			});
		}
	}
	return result;
}
function getSelectedDate(jsonData, mes, anio){
	var data = $.grep(jsonData, function (dato) { return parseInt(dato.split('/')[2]) == anio && parseInt(dato.split('/')[1]) == mes});
	return data;
}
function sum(arr){
	var suma = 0;
	for (let i = 0; i < arr.length; i++) {
		  suma += parseInt(arr[i]);
		}
	return suma;
}
function count(arr){
	var contador = 0;
	for (let i = 0; i < arr.length; i++) {
		  contador += 1;
		}
	return contador;
}
function getMaxDate(jsonData, mes, anio){
	var dia = jsonData.sort(function(a,b){return new Date(a.split('/')[1] + '/' + a.split('/')[0] + '/' + a.split('/')[2] )-new Date(b.split('/')[1] + '/' + b.split('/')[0] + '/' + b.split('/')[2] )});
	return dia[dia.length-1];
}
function pruebaDivAPdf() {
        var pdf = new jsPDF('p', 'pt', 'letter');
        source = $('#Reportes')[0];

        specialElementHandlers = {
            '#bypassme': function (element, renderer) {
                return true
            }
        };
        margins = {
            top: 80,
            bottom: 60,
            left: 40,
            width: 522
        };

        pdf.fromHTML(
            source, 
            margins.left, // x coord
            margins.top, { // y coord
                'width': margins.width, 
                'elementHandlers': specialElementHandlers
            },

            function (dispose) {
                pdf.save(nombre);
            }, margins
        );
    }

function collapse(event){
	if (event.target.nextElementSibling.style.display == ''){
		event.target.nextElementSibling.style.display = "block";
	}
	else if(event.target.nextElementSibling.style.display == "none"){
		event.target.nextElementSibling.style.display = "block";
	}else{
		event.target.nextElementSibling.style.display = "none";
	}
	
	// Cargo las grillas internas
	//switch
	
	//event.target.innerText.split('(')[0].trim()
}
function loadGrillasInternas(){}