dojo.require("dijit.layout.BorderContainer");
dojo.require("dijit.layout.ContentPane");
dojo.require("esri.arcgis.utils");
dojo.require("esri.map");

var _mapSat;
var _mapOV;
var _scroll;
var _sourceLayer;
var _locations;
var _selected;
var _popup;

var _initialCenter;

var _divMapRight;
var _divMapLeft;

var _introScroller;

var _lutIconSpecs = {
	normal:new IconSpecs(22,28,3,8),
	medium:new IconSpecs(24,30,3,8),
	large:new IconSpecs(32,40,3,11)
}

var STATE_INTRO = 0;
var STATE_TABLE = 1;
var STATE_INFO = 2;

var _currentState = STATE_INTRO;

var ICON_RED_PREFIX = "resources/icons/red/NumberIcon";
var ICON_RED_SUFFIX = ".png";

var ICON_BLUE_PREFIX = "resources/icons/dim_red/NumberIcon";
var ICON_BLUE_SUFFIX = "d.png";

var _dojoReady = false;
var _jqueryReady = false;

var _isMobile = isMobile();
var _isLegacyIE = ((navigator.appVersion.indexOf("MSIE 8") > -1) || (navigator.appVersion.indexOf("MSIE 7") > -1));
var _isIE = (navigator.appVersion.indexOf("MSIE") > -1)

var _isEmbed = false;

dojo.addOnLoad(function() {_dojoReady = true;init()});
jQuery(document).ready(function() {_jqueryReady = true;init()});

if (document.addEventListener) {
	document.addEventListener('touchmove', function (e) { e.preventDefault(); }, false);
} else {
	document.attachEvent('touchmove', function (e) { e.preventDefault(); }, false);
}

var _counter = 0;

function init() {
	
	if (!_jqueryReady) return;
	if (!_dojoReady) return;
	
	if (_configOptions.proxyURL) esri.config.defaults.io.proxyUrl = _configOptions.proxyURL;

	_divMapRight = $("#map");
	_divMapLeft = $("#mapOV");

	$("#info").css("padding-left", _configOptions.popupLeftMargin);	
	
	// determine whether we're in embed mode
	
	var queryString = esri.urlToObject(document.location.href).query;
	if (queryString) {
		if (queryString.embed) {
			if (queryString.embed.toUpperCase() == "TRUE") {
				_isEmbed = true;
				$("body").width(600);
				$("body").height(400);
			}
		}
	}
	
	_popup = new esri.dijit.Popup(null, dojo.create("div"));
	
	var mapLargeScale = esri.arcgis.utils.createMap(_configOptions.webmap_largescale, "map", {
		mapOptions: {slider: true, wrapAround180: true}, 
		ignorePopups: true
	});
	
	mapLargeScale.addCallback(function(response) {
		_mapSat = response.map;
		if(_mapSat.loaded){
			initMap();
		} else {
			dojo.connect(_mapSat,"onLoad",function(){
				initMap();
			});
		}
	});

	var mapDeferred = esri.arcgis.utils.createMap(_configOptions.webmap_overview, "mapOV", {
		mapOptions: {
			slider: true,
			wrapAround180: false
		},
		ignorePopups: false,
		infoWindow: _popup	
	});
	
	mapDeferred.addCallback(function(response) {	  
		
		if ((_configOptions.title == null) || (_configOptions.title == "")) _configOptions.title = response.itemInfo.item.title;
		if ((_configOptions.subtitle == null) || (_configOptions.subtitle == "")) _configOptions.subtitle = response.itemInfo.item.snippet;
		
		$("#title").append(_configOptions.title);
		$("#subtitle").append(_configOptions.subtitle);	
		$(document).attr("title", _configOptions.title);
		
		if (!_configOptions.showIntro) {
			$("#intro").css("display", "none");
		}
		
		$("#info").height(_configOptions.popupHeight);
		
		_mapOV = response.map;		
		_mapOV.graphics.hide();	

		if (_configOptions.contentLayerOverride) {
			_sourceLayer = _mapOV.getLayer(_configOptions.contentLayerOverride);
		} else {
			var sourceID = $.grep(response.itemInfo.itemData.operationalLayers, function(n, i){return n.title == _configOptions.contentLayer})[0].featureCollection.layers[0].id;
			_sourceLayer = _mapOV.getLayer($.grep(_mapOV.graphicsLayerIds, function(n,i){return _mapOV.getLayer(n).id == sourceID})[0]);
		}

		_locations = _sourceLayer.graphics;
		$.each(_locations, function(index, value){value.attributes.getValueCI = getValueCI}); // assign extra method to handle case sensitivity
		_locations.sort(compare);
		
		loadList();
		
		if (_isMobile) {
			_scroll = new iScroll('wrapper', {snap:'li',momentum:true});
			$("#innerIntro").height(1000);
			_introScroller = new iScroll('intro');
		} else {
			$("#wrapper").css("overflow", "hidden");
			$("#thelist").css("overflow-x", "hidden");
			$("#thelist").css("overflow-y", "scroll");			
		}

		$("#mapOV .esriSimpleSlider").hide();	
				
		dojo.connect(_sourceLayer, "onMouseOver", layer_onMouseOver);
		dojo.connect(_sourceLayer, "onMouseOut", layer_onMouseOut);
		dojo.connect(_sourceLayer, "onClick", layer_onClick);			

		if(_mapOV.loaded){
			initMap();
		} else {
			dojo.connect(_mapOV,"onLoad",function(){
				initMap();
			});
		}
				
	});
	
}

function initMap() {
	
	if (!_mapSat || !_mapOV) {
		// kicking out because one of the maps doesn't exist yet...
		return null;
	}
	
	if (!_mapSat.loaded || !_mapOV.loaded) {
		// kicking out because one of the maps hasn't loaded yet...
		return null;
	}
	
    //mark the initial center, because maps are about to get resized, 
	//and we may need to re-establish the center.
	_initialCenter = _mapOV.extent.getCenter();

	$("#case #blot").css("left", $("#case").width());
	
	switchMaps();

	setTimeout(function(){
		if(_scroll){_scroll.refresh()}
		var level = ($(_divMapRight).width() / $(_divMapRight).height() > 1.2) ? _configOptions.initialZoomLevelWide : _configOptions.initialZoomLevel;
		_mapSat.centerAt(_initialCenter);
		if (!_isLegacyIE) {
			_mapOV.centerAndZoom(_initialCenter, level);		
			$("#whiteOut").fadeOut("slow");		
		} else {
			_mapOV.centerAndZoom(_initialCenter, 12);	
			setTimeout(function(){_mapOV.centerAndZoom(_initialCenter, level); $("#whiteOut").fadeOut("slow");}, 1000);	
		}
	},500);

	// jQuery event assignment
	
	$(this).resize(handleWindowResize);
	
	$("#topRow .numberDiv").click(function(e) {
		pageUp();
	});
	
	$("#topRow #iconList").click(function(e) {
		changeState(STATE_TABLE);
	});

	$("#bottomRow .numberDiv").click(function(e) {
		pageDown();
	});
	
	$(document).keydown(onKeyDown);	
			
	$("li").click(listItemClick);
	
	$("#flipper").click(function(e) {
		switchMaps();
	});		

	$("#mapOV").hover(function(e) {
		$("#mapOV .esriSimpleSlider").fadeIn();
	},function(e) {
		$("#mapOV .esriSimpleSlider").fadeOut();
	});
	
	$("#iconHome").click(function(e) {
		preSelection();
		if (_configOptions.showIntro) {
	        changeState(STATE_INTRO);
		} else {
	        changeState(STATE_TABLE);
		}
		scrollToPage(0);
		if ($(_divMapRight).attr("id") == "map") switchMaps();
		setTimeout(function() {
			var level = ($(_divMapRight).width() / $(_divMapRight).height() > 1.2) ? _configOptions.initialZoomLevelWide : _configOptions.initialZoomLevel;
			_mapOV.centerAndZoom(_initialCenter, level);		
		}, 500);
		_counter = 0;
    });
	
	$("#iconLeft").click(function(e) {
        changeState(STATE_INFO);
    });

}

function transfer()
{
	var arr = $.grep(_sourceLayer.graphics, function(n, i){
		return n.attributes.getValueCI(_configOptions.fieldName_Rank) == _selected.attributes.getValueCI(_configOptions.fieldName_Rank);
	});
	_mapOV.infoWindow.setFeatures([arr[0]]);
	_mapOV.infoWindow.show();
	$("#info").html($(".contentPane"));
}

function onKeyDown(e)
{
	
	if (!_selected) return;
	
	if ((e.keyCode != 38) && (e.keyCode != 40)) {
		return;
	}

	var index = $.inArray(_selected, _locations);
	index = (e.keyCode == 40) ? index + 1 : index - 1;
	if ((index > _locations.length - 1) || (index < 0)) return; 

	preSelection();
	_selected = _locations[index];
	postSelection();
	highlightTab($("#thelist li").eq(index));
	scrollToPage(index);
	
}

function listItemClick(e) 
{
	
	if ($(this).find(".numberDiv").hasClass("selected") && (_currentState != STATE_TABLE)) {
		changeState(STATE_TABLE);
	} else {
		
		
		var index = $.inArray(this, $("#thelist li"));
		preSelection();
		_selected = _locations[index];
		if (_counter == 0) switchMaps();
		postSelection();
		highlightTab(this);

		if (_currentState != STATE_INFO) changeState(STATE_INFO);				
		
	}
}

function scrollToPage(index)
{
	if (_scroll) {
		_scroll.scrollToPage(0, index, 500);
	} else {
		$("#thelist").animate({scrollTop: (index*41)}, 'slow');
	}
}

function pageDown()
{
	var div = Math.floor($("#wrapper").height() / 41);
	if (_scroll) {
		_scroll.scrollTo(0, div * 41, 200, true);
	} else {
		var top = $("#thelist").scrollTop() + (div*41); 
		$("#thelist").animate({scrollTop: top}, 'slow');
	}
}

function pageUp()
{
	var div = Math.floor($("#wrapper").height() / 41);
	if (_scroll) {
		_scroll.scrollTo(0, -div * 41, 200, true);
	} else {
		var currentIndex = Math.floor($("#thelist").scrollTop() / 41);
		var newIndex = currentIndex - div;
		var top = newIndex*41; 
		$("#thelist").animate({scrollTop: top}, 'slow');
	}
}

function reveal(retractIntro)
{
	setTimeout(function(){$("#blot").animate({left:40},"slow",null,function(){
		_mapOV.resize(); 
		_mapSat.resize();
		$("#flipper").fadeIn("slow");
		transfer();
		if (retractIntro) $("#intro").animate({left:500},"slow");				
	})}, 400);	
}

function changeState(toState)
{

	if (toState == STATE_TABLE) {
		if (_currentState == STATE_INTRO) {
			$("#intro").animate({left:500},"slow");
		} else if (_currentState == STATE_INFO) {
			$("#flipper").hide();
			$("#blot").animate({left:$("#case").width()});
		} else if (_currentState == STATE_TABLE) {
			// redundant
		} else {
			throwStateException(_currentState);
		}
		$("#iconList").hide();
	} else if (toState == STATE_INFO) {
		if (_currentState == STATE_INTRO) {
			reveal(true);
		} else if (_currentState == STATE_TABLE) {
			reveal(false);
		} else if (_currentState == STATE_INFO) {
			// redundant
		} else {
			throwStateException(_currentState);
		}
		$("#iconLeft").hide();
		$("#iconList").show();
	} else if (toState == STATE_INTRO) {
		if (_currentState == STATE_TABLE) {
			$("#intro").animate({left:41},"slow");
		} else if (_currentState == STATE_INFO) {
			$("#intro").animate({left:41},"slow",function(){
				$("#blot").animate({left:$("#case").width()});
			});
			$("#flipper").hide();
		} else if (_currentState == STATE_INTRO) {
			// redundant
		} else {
			throwStateException(_currentState)
		}
	} else {
		throwStateException(toState);
	}
	
	_currentState = toState;
	
}

function throwStateException(allegedState)
{
	throw("invalid state: ", allegedState);
}

function switchMaps()
{
	
	var temp = _divMapRight;
	_divMapRight = _divMapLeft;
	_divMapLeft = temp;
	
	$(_divMapRight).detach();
	$(_divMapLeft).detach();
	
	$("#inner").append(_divMapLeft);
	$(_divMapRight).insertAfter($("#leftPane"));
	
	handleWindowResize();
	
	if (_selected) {
		setTimeout(function(){
			_mapSat.centerAt(_selected.geometry);
			_mapOV.centerAt(_selected.geometry);
			setTimeout(function(){
				moveGraphicToFront(_selected);
			},500);
		},500);
	}
	
}

function loadList()
{
	var numDiv;
	var nameDiv;
	var li;	
	var spec = _lutIconSpecs.normal;
	$.each(_locations, function(index, value) {
		value.setSymbol(new esri.symbol.PictureMarkerSymbol(
			ICON_BLUE_PREFIX+value.attributes.getValueCI(_configOptions.fieldName_Rank)+ICON_BLUE_SUFFIX, 
			spec.getWidth(), 
			spec.getHeight()).setOffset(spec.getOffsetX(), spec.getOffsetY())
		);
	   numDiv = $("<div class='numberDiv'>"+value.attributes.getValueCI(_configOptions.fieldName_Rank)+"</div>");
	   $(numDiv).attr("title", "#"+value.attributes.getValueCI(_configOptions.fieldName_Rank)+": "+value.attributes.getValueCI(_configOptions.fieldName_Name));
	   nameDiv = $("<div class='nameDiv'><span style='margin-left:20px'>"+value.attributes.getValueCI(_configOptions.fieldName_Name)+"</span></div>");
	   li = $("<li></li>");
	   $(li).append(numDiv);
	   $(li).append(nameDiv);
	   $("#thelist").append(li);
	});	
}

function highlightTab(tab) 
{
	$(tab).find(".numberDiv").addClass("selected");
	$(tab).find(".nameDiv").addClass("selected");
}

function layer_onClick(event)
{
	preSelection();
	_selected = event.graphic;
	var index = $.inArray(_selected, _locations);
	highlightTab($("#thelist li").eq(index));
	scrollToPage(index);	
	if (_counter == 0) switchMaps();
	postSelection();
	if (_currentState != STATE_INFO) changeState(STATE_INFO);
}

function layer_onMouseOver(event)
{
	if (_isMobile) return;	
	var graphic = event.graphic;
	var spec = _lutIconSpecs.medium;
	if (graphic != _selected) {
		graphic.setSymbol(graphic.symbol.setHeight(spec.getHeight()).setWidth(spec.getWidth()).setOffset(spec.getOffsetX(), spec.getOffsetY()));
	}
	if (!_isIE) moveGraphicToFront(graphic);	
	_mapOV.setMapCursor("pointer");
	$("#hoverInfo").html(graphic.attributes.getValueCI(_configOptions.fieldName_Name));
	var pt = _mapOV.toScreen(graphic.geometry);
	hoverInfoPos(pt.x, pt.y);	
}

function layer_onMouseOut(event)
{
	_mapOV.setMapCursor("default");
	$("#hoverInfo").hide();	
	var graphic = event.graphic;
	var spec = _lutIconSpecs.normal;
	if (graphic != _selected) {
		graphic.setSymbol(graphic.symbol.setHeight(spec.getHeight()).setWidth(spec.getWidth()).setOffset(spec.getOffsetX(), spec.getOffsetY()));
	}
}

function handleWindowResize() {
	
	if (($("body").height() <= 600) || ($("body").width() <= 1000)) $("#header").height(0);
	else $("#header").height(115);
	
	$("#leftPane").height($("body").height() - $("#header").height());
	$("#leftPane").width(parseInt($("body").width() * .4));
	if ($("#leftPane").width() > 300) $("#leftPane").width(300);

	$("#case").height($("#leftPane").height());

	$("#table").height($("#case").height());
	$("#table #wrapper .nameDiv").width($("#leftPane").width() - $("#table #wrapper .numberDiv").width()); 
	
	$("#table #wrapper").height($("#case").height() - $("#table #topRow").height() - $("#table #bottomRow").height() - 3);
	$("#blot").width($("#leftPane").width() - 40);	
	$("#blot").height($("#leftPane").height() - $("#table #topRow").height() - 21);
	
	$("#intro").width($("#leftPane").width()-70);
	$("#intro").height($("#leftPane").height());
		
	$(_divMapRight).height($("body").height() - $("#header").height());
	$(_divMapRight).width($("body").width() - $("#leftPane").outerWidth());
	$(_divMapRight).css("left", $("#leftPane").outerWidth());
	$(_divMapRight).css("top", $("#header").height());	
	
	$("#blot #inner").height($("#blot").height() - (parseInt($("#blot #inner").css("margin-top")) + parseInt($("#blot #inner").css("margin-bottom"))));
	
	$(_divMapLeft).width($("#blot #inner").width());
	$(_divMapLeft).height($("#blot #inner").height() - ($("#blot #info").height() + parseInt($("#blot #inner").css("margin-top"))));
	$(_divMapLeft).css("top", $("#blot #info").outerHeight());
	$(_divMapLeft).css("left", 0);	
	
	$("#flipper").css("top", $("#info").height() + ($(_divMapLeft).height() / 2) + ($("#flipper").height() / 2));
	
	if (!_scroll) {
		$("#thelist").height($("#wrapper").height());
	}
	
	if (_mapSat) _mapSat.resize();
	if (_mapOV) _mapOV.resize();
	
}

function preSelection() {
	
	// return the soon-to-be formerly selected graphic icon to normal
	// size; also remove highlight from table record.
	
	if (_selected) {
		$("li .nameDiv").removeClass("selected");
		$("li .numberDiv").removeClass("selected");		
		var height = _lutIconSpecs["normal"].getHeight();
		var width = _lutIconSpecs["normal"].getWidth();
		var offset_x = _lutIconSpecs["normal"].getOffsetX()
		var offset_y = _lutIconSpecs["normal"].getOffsetY();
		var url = ICON_BLUE_PREFIX+_selected.attributes.getValueCI(_configOptions.fieldName_Rank)+ICON_BLUE_SUFFIX;
		_selected.setSymbol(_selected.symbol.setHeight(height).setWidth(width).setOffset(offset_x,offset_y).setUrl(url));
	}
	
}

function postSelection()
{

	// center to selected location, and zoom, if appropriate.
	var level = _selected.attributes.getValueCI(_configOptions.fieldName_Level);
	if (!level) level = _configOptions.defaultLargeScaleZoomLevel;
	if (_isIE) {
		// using work-around for IE, because centerAndZoom seems to have
		// issues when panning over large distances
		specialCenterAndZoom(_mapSat, _selected.geometry, level);
	} else {
		// not really sure it's necessary to distinguish between 
		// centerAt and centerAndZoom.  pretty sure I could get by
		// with just centerAndZoom, but just in case centerAt is more
		// fluid, I will provide the option.
		if (level == _mapSat.getLevel()) {
			_mapSat.centerAt(_selected.geometry)
		} else {
			_mapSat.centerAndZoom(_selected.geometry, level)
		}
	}
		
	// make the selected location's icon BIG
	var height = _lutIconSpecs["large"].getHeight();
	var width = _lutIconSpecs["large"].getWidth();
	var offset_x = _lutIconSpecs["large"].getOffsetX()
	var offset_y = _lutIconSpecs["large"].getOffsetY();
	var url = ICON_RED_PREFIX+_selected.attributes.getValueCI(_configOptions.fieldName_Rank)+ICON_RED_SUFFIX;	
	
	_selected.setSymbol(_selected.symbol.setHeight(height).setWidth(width).setOffset(offset_x, offset_y).setUrl(url));
	
	transfer();
	
	_counter++;
	
	setTimeout(function(){
		_mapOV.centerAt(_selected.geometry);
		setTimeout(function(){
			moveGraphicToFront(_selected);			
		}, 500)
	},500);
	
}

function hoverInfoPos(x,y){
	if (x <= ($("#map").width())-230){
		$("#hoverInfo").css("left",x+15);
	}
	else{
		$("#hoverInfo").css("left",x-25-($("#hoverInfo").width()));
	}
	if (y >= ($("#hoverInfo").height())+50){
		$("#hoverInfo").css("top",y-35-($("#hoverInfo").height()));
	}
	else{
		$("#hoverInfo").css("top",y-15+($("#hoverInfo").height()));
	}
	$("#hoverInfo").show();
}

function getValueCI(field) {
	var found;
	$.each(this,function(index,value){
		if (index.toUpperCase() == field.toUpperCase()) {
			found = index;
			return false;
		}
	});
	return this[found];	
}

function compare(a,b) {
	rank_a = parseInt(a.attributes.getValueCI(_configOptions.fieldName_Rank));
	rank_b = parseInt(b.attributes.getValueCI(_configOptions.fieldName_Rank));
	if (rank_a < rank_b) return -1;
	else if (rank_a == rank_b) return 0;
	else return 1;
}

function specialCenterAndZoom(map, center, level)
{
	
	/* this function is a work-around to using centerAt() at large extents.
	   there seems to be a bug whereby the map fetches unneccesary tiles
	   on centerAt(), so we need to make sure to turn off layers (and zoom out?)
	   before re-centering */
	
	// which layers are visible?
	
	var visibleLayers = [];
	
	$.each(map.layerIds, function(index, value) {
		if (map.getLayer(value).visible) visibleLayers.push(value);
	});
	
	$.each(map.graphicsLayerIds, function(index, value) {
		if (map.getLayer(value).visible) visibleLayers.push(value);
	});
	
	// turn off visible layers
	
	$.each(visibleLayers, function(index, value) {
		map.getLayer(value).hide();
	});

	map.setLevel(3);
	setTimeout(function() {
		map.centerAt(center);
		setTimeout(function() {
			map.setLevel(level);
			map.centerAt(center);
			setTimeout(function(){
				// turn visible layers back on
				$.each(visibleLayers, function(index, value) {
					map.getLayer(value).show();
				});
			}, 200);
		}, 200);
	}, 200)
}