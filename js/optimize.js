/**
 * Created by amandaghassaei on 12/3/16.
 */


function initOptimizer(fitness){

    var running = false;
    var angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];

    var rotationZeroTol = 0.1;
    setInput("#rotationZeroTol", rotationZeroTol, function(val){
        rotationZeroTol = val;
    });
    var cameraTol = 1;
    setInput("#cameraTol", cameraTol, function(val){
        cameraTol = val;
    });
    var lookatTol = 1;
    setInput("#lookAtTol", lookatTol, function(val){
        lookatTol = val;
    });
    var cameraRotationTol = 0.1;
    setInput("#cameraRotationTol", cameraRotationTol, function(val){
        cameraRotationTol = val;
    });


    var originVis, crosshairVis;

    function optimize(params, stepSize){

        webcam.pause();

        if (!mesh) {
            showWarn("upload a mesh before starting optimization");
            return;
        }
        mesh.visible = false;
        originVis = origin.visible;
        origin.visible = false;
        crosshairVis = $("#crosshairs").is(":visible");
        $("#crosshairs").hide();
        fitness.setVisiblity(true);
        $('#showOutline').prop('checked', true);
        render();

        $("#controls").hide();
        $("#cameraControls").hide();
        $("#warning").hide();

        running = true;

        socket.emit('rotation', "g0 x" + angles[0]);
        var bestFitnessAngles = [];

        setTimeout(function(){//waste time to make sure we get rotation done
            window.requestAnimationFrame(function(){
                findInitialFitness(params, bestFitnessAngles, stepSize);
            });
        }, 1000);


    }

    function findInitialFitness(params, bestFitnessAngles, stepSize){
        sliderInputs['#outlineOffset'](0);//start at zero
        evaluate(function(initialFitness, initialOffset){
            if (initialFitness == -1) {
                showWarn("bad initial fitness");
                pause();
                return;
            }
            bestFitnessAngles.push([initialFitness, initialOffset]);
            if (bestFitnessAngles.length == angles.length){
                //move to zero angle
                socket.emit('rotation', "g0 x" + angles[0]);
                setTimeout(function(){//waste time to make sure we get rotation done
                    gradient(params, bestFitnessAngles, stepSize);
                }, 1000);
            } else {
                //move to next angles
                socket.emit('rotation', "g0 x" + angles[bestFitnessAngles.length]);
                setTimeout(function(){//waste time to make sure we get rotation done
                    findInitialFitness(params, bestFitnessAngles, stepSize);
                }, 500);
            }
        }, 0);

    }

    function moveParams(params, allFitnesses, bestFitnessAngles, stepSize){

        var avgVector = [];
        for (var j = 0; j < params.length; j++) {
            avgVector.push(0);
        }

        for (var i=0;i<angles.length;i++) {
            var vector = [];
            for (var j = 0; j < params.length; j++) {
                var paramData = allFitnesses[i][j];
                var bestParamData = paramData[paramData.length - 1];
                if (isBetter(bestParamData, bestFitnessAngles[i])) {
                    if (paramData.length == 1) vector.push(1);
                    else vector.push(-1);
                } else {
                    vector.push(0);
                }
            }
            for (var j = 0; j < params.length; j++) {
                avgVector[j] += vector[j];
            }
        }
        var vectorLength = 0;
        for (var i=0;i<avgVector.length;i++){
            if (Math.abs(avgVector[i])<angles.length) avgVector[i] = 0;//only move if all in agreement
            vectorLength += avgVector[i]*avgVector[i];
        }
        vectorLength = Math.sqrt(vectorLength);

        console.log(avgVector);
        if (vectorLength == 0){
            //opt found
            pause();
            return;
        }

        //normalize to step size and set vars
        for (var j=0;j<vector.length;j++){
            vector[j] *= stepSize/vectorLength;
            var key = "#" + params[j];
            sliderInputs[key](currentValues[key] + vector[j]);
        }
        sliderInputs['#outlineOffset'](0);

        //todo pass bestFitnessAngles here?
        socket.emit('rotation', "g0 x" + angles[0]);
        //call get first stats
        bestFitnessAngles = [];
        setTimeout(function(){//waste time to make sure we get rotation done
            window.requestAnimationFrame(function(){
                findInitialFitness(params, bestFitnessAngles, stepSize);
            });
        }, 1000);
    }

    function gradient(params, bestFitnessAngles, stepSize){
        var allFitnesses = [];
        for (var i=0;i<angles.length;i++){
            allFitnesses.push([]);
            for (var j=0;j<params.length;j++){
                allFitnesses[i].push([]);
            }
        }

        _gradient(params, 0, 0, stepSize, allFitnesses, bestFitnessAngles, 0);
    }

    function _gradient(params, j, k, stepSize, allFitnesses, bestFitnessAngles, i){//j = param index, k = direction, i = angleIndex
        var key = "#" + params[j];
        var current = currentValues[key];
        var nextVal = current + stepSize;
        if (k == 1) nextVal = current - stepSize;
        sliderInputs[key](nextVal);
        var nextOffset = bestFitnessAngles[i][1]-1;
        if (nextOffset<0) nextOffset = 0;
        sliderInputs['#outlineOffset'](nextOffset);//start at one offset less than current best
        window.requestAnimationFrame(function() {
            evaluate(function (newFitness, newOffset) {
                sliderInputs[key](current);//reset back to original
                allFitnesses[i][j].push([newFitness, newOffset]);
                if (k == 0 && !isBetter([newFitness, newOffset], bestFitnessAngles[i])) {
                    _gradient(params, j, 1, stepSize, allFitnesses, bestFitnessAngles, i);//try neg
                } else if (j < params.length - 1) {
                    _gradient(params, j + 1, 0, stepSize, allFitnesses, bestFitnessAngles, i);//try other dimensions
                } else if (i<angles.length-1) {
                    socket.emit('rotation', "g0 x" + angles[i+1]);
                    setTimeout(function(){//waste time to make sure we get rotation done
                        _gradient(params, 0, 0, stepSize, allFitnesses, bestFitnessAngles, i+1);
                    }, 500);
                } else moveParams(params, allFitnesses, bestFitnessAngles, stepSize);
            }, 0, bestFitnessAngles[i]);
        });
    }

    function isBetter(newData, oldData){
        if (newData[1] < oldData[1]) return true;//offset
        if (newData[1] == oldData[1]){
            if (newData[0] > oldData[0]) return true;//num pixels
        }
        return false;
    }

    function evaluate(callback, phase, bestStats){
        if (!running) return;
        if (phase < 1){//render
            render();
            webcam.getFrame();
            setTimeout(function(){//waste time to make sure we get next webcam frame
                window.requestAnimationFrame(function(){
                    evaluate(callback, phase+1, bestStats);
                });
            }, 500);
        } else {
            var _fitness = fitness.calcFitness();
            var currentOffset = fitness.getOutlineOffset();
            showWarn("offset: " + currentOffset + ", fitness: " + _fitness);
            if (_fitness < 0) {
                var nextOutlineOffset = currentOffset + 1;
                if (bestStats && nextOutlineOffset>bestStats[1]){//already inited
                    callback(-1, nextOutlineOffset);
                    return;
                }
                //looking for best stats
                if (nextOutlineOffset > 30){
                    callback(_fitness, currentOffset);
                    return;
                }
                sliderInputs['#outlineOffset'](nextOutlineOffset);
                window.requestAnimationFrame(function(){
                    evaluate(callback, 0, bestStats);
                });
            }
            else callback(_fitness, currentOffset);
        }
    }

    function pause(){
        running = false;
        webcam.start();
        $("#controls").show();
        $("#cameraControls").show();
        if (mesh) mesh.visible = true;
        origin.visible = originVis;
        if (crosshairVis) $("#crosshairs").show();
        render();
    }

    function isRunning(){
        return running;
    }


    $(".optimize").click(function(e){
        e.preventDefault();
        var $target = $(e.target);
        var id = $target.parent().data("id");
        var params = [];
        var stepSize;
        if (id == "camera"){
            params.push("cameraX");
            params.push("cameraY");
            params.push("cameraZ");
            stepSize = cameraTol;
        } else if (id == "lookAt"){
            params.push("lookAtX");
            params.push("lookAtY");
            stepSize = lookatTol;
        } else if (id == "rotationZero") {
            params.push("rotationZero");
            stepSize = rotationZeroTol;
        } else if (id == "cameraRotation") {
            params.push("cameraRotation");
            stepSize = cameraRotationTol;
        } else {
            showWarn("unknown optimization parameter " + id);
            console.warn("unknown optimization parameter " + id);
            return;
        }
        optimize(params, stepSize);
    });

    return {
        pause: pause,
        isRunning: isRunning
    }
}