var datos_originales = [];
var datos_mora_temprana = []; // Almaceno los registros con días de mora menor a 4 días.
var datos_deudores_varios = []; // Almaceno los registros menos de la deuda definida.
var datos_casos_cerrados = []; // Almaceno los registros cerrados (pago total).
var fechas_maximas = []; // Almaceno las fechas máximas de todos los meses del reporte

// Constantes
let mesInicio = 4;
let anioInicio = 2022;
const diasMoraMinimo = 4;
const montoDeudaMinima = 4000;

const anioFin = new Date().getFullYear();
const mesFin = new Date().getMonth();

$( document ).ready(function() {
	document.getElementById("defaultOpen").click();
});

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
		//visualizar();
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

function upload(file) {
    if (file.type.match(/text\/csv/) || file.type.match(/vnd\.ms-excel/)) {
        //if(file.type.match(/text\/csv/)){
        oFReader = new FileReader();
        oFReader.onloadend = function () {
            datos_originales = JSON.parse(csvJSON(this.result));
			
			procesarArchivo();
        };
        $("#divFiltro").show(700);
        oFReader.readAsText(file);
    } else {
        console.log("This file does not seem to be a CSV.");
    }
}

function procesarArchivo(){
	// Elimino los registros que no tienen datos, los headers y footers
	normalizarDatos();
	
	// Elimino los registros con Días de Mora menores al requerido.
	eliminarMoraTemprana();
	
	// Elimino los Deudores Varios
	eliminarDeudoresVarios();
	
	// Calculo la fecha máxima de cada mes del reporte
	calcularFechasMaximas();
	
	// Busco todos los clientes distintos y fechas 
	var clientes = distinct(datos_originales.map(c => c.NroCliente ));

	// Loopeo por NroCliente
	for(i = 0; i < clientes.length; i++){
		
		// Loopeo por Anio
		for(j = anioInicio; j < anioFin + 1; j++){
			
			// Loopeo por Mes
			for(k = mesInicio; k < mesFin + 1; k++){
				
				// Voy a buscar todos los registros de cada clientes
				var registrosCliente = $.grep(datos_originales, function(item){return item.NroCliente == clientes[i].item && item.Dia.split('/')[1] == k && item.Dia.split('/')[2] == j});
				
				// Obtengo los casos Cerrados
				esCasoCerrado(registrosCliente, k, j);
				
				//if (){// Casos Cerrados}
				//else if(){ // Casos Legales}
				//else {// Casos Vigentes}
				
				// Loopeo los registros de cada cliente
				for(l = 0; l < registrosCliente.length; l++){
					
					// Parseo todos los montos de deuda para que sean legibles por la jsGrid
					//registrosCliente[k].DeudaVda = parseInt(datos_originales[i].DeudaVda);
					
					
					
					
				}
			}
			mesInicio = 1;
		}
	}
	
	// Parseo todos los montos de deuda para que sean legibles por la jsGrid
	//datos_originales[k].DeudaVda = parseInt(datos_originales[i].DeudaVda);
}

function esCasoCerrado(jsonData, mes, anio){
	jsonData = ordenarPorFecha(jsonData, "desc");
	var fechaMesMax = $.grep(fechas_maximas, function(item){return item.split('/')[1] == mes && item.split('/')[2] == anio})[0];
	
	// Guardo casos cerrados que no volvieron a incurrir en mora
	if (jsonData.length > 0 && jsonData[0].Dia != fechaMesMax){
		datos_casos_cerrados.push(jsonData[0]);
	}else{
		if (jsonData.length > 1 && parseInt(fechaMesMax.split('/')[0]) - parseInt(jsonData[1].Dia.split('/')[0]) > 1){
			datos_casos_cerrados.push(jsonData[1]);
		}
	}
}

function calcularFechasMaximas(){
	// Loopeo por Anio
	for(j = anioInicio; j < anioFin + 1; j++){
			
		// Loopeo por Mes
		for(k = mesInicio; k < mesFin + 1; k++){
			var fechas = $.grep(datos_originales, function(item){return item.Dia.split('/')[1] == k && item.Dia.split('/')[2] == j});
			fechas_maximas.push(obtenerFechaMaxima(fechas));
		}
		mesInicio = 1;
	}
	fechas_maximas = fechas_maximas.map(c => c.Dia)
}

function eliminarMoraTemprana(){	
	datos_mora_temprana = $.grep(datos_originales, function(item){return item.Dias < diasMoraMinimo});
	datos_originales = $.grep(datos_originales, function(item){return item.Dias >= diasMoraMinimo});
}

function eliminarDeudoresVarios(){
	datos_deudores_varios = $.grep(datos_originales, function(item){return item.DeudaVda < montoDeudaMinima});
	datos_originales = $.grep(datos_originales, function(item){return item.DeudaVda >= montoDeudaMinima});
}

function normalizarDatos(){
	datos_originales = $.grep(datos_originales, function (dato) { return !dato.NroCliente.includes("Cantidad") && !dato.NroCliente.includes("Nro. Cliente")});
	for (i = 0; i < datos_originales.length; i++){
		datos_originales[i].DeudaVda = parseInt(datos_originales[i].DeudaVda);
	}
}

function ordenarPorFecha(jsonData, order){
	var output = [];
	if (order == "asc"){
		output = jsonData.sort(function(a,b){return new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )-new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )});
	}else{
		output = jsonData.sort(function(a,b){return new Date(b.Dia.split('/')[1] + '/' + b.Dia.split('/')[0] + '/' + b.Dia.split('/')[2] )-new Date(a.Dia.split('/')[1] + '/' + a.Dia.split('/')[0] + '/' + a.Dia.split('/')[2] )});
	}
	return output;
}

function obtenerFechaMaxima(jsonData){
	var dia = ordenarPorFecha(jsonData, "asc");
	return dia[dia.length-1];
}

function distinct(data){
	const result = [];
	const map = new Map();
	for (const item of data) {
		if(!map.has(item)){
			map.set(item, true);
			result.push({
				item: item
			});
		}
	}
	return result;
}

