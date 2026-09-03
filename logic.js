function canInstallComponent(build, newItem) {
    if (!build) return { can: true };
    const comp = build.components || build;

    // Перевірка сокета процесора та материнки
    if (newItem.type === 'cpu' && comp.motherboard && newItem.socket !== comp.motherboard.socket) {
        return { can: false, reason: `❌ Сокет CPU (${newItem.socket}) не підходить до плати (${comp.motherboard.socket})` };
    }
    if (newItem.type === 'motherboard' && comp.cpu && newItem.socket !== comp.cpu.socket) {
        return { can: false, reason: `❌ Сокет плати (${newItem.socket}) не підходить до CPU (${comp.cpu.socket})` };
    }

    // Перевірка типу RAM та материнки
    if (newItem.type === 'ram' && comp.motherboard && newItem.ramType !== comp.motherboard.ramType) {
        return { can: false, reason: `❌ Тип RAM (${newItem.ramType}) не підтримується платою (${comp.motherboard.ramType})` };
    }
    if (newItem.type === 'motherboard' && comp.ram && newItem.ramType !== comp.ram.ramType) {
        return { can: false, reason: `❌ Плата (${newItem.ramType}) не підтримує вашу RAM (${comp.ram.ramType})` };
    }

    return { can: true };
}

// Допоміжна функція для визначення налаштувань графіки
function getPreset(gpuScore) {
    if (gpuScore <= 50) return "1080p Низькі";
    if (gpuScore <= 150) return "1080p Середні";
    if (gpuScore <= 350) return "1080p Ультра";
    if (gpuScore <= 600) return "2K Високі";
    return "4K Ультра";
}

// Парсер пам'яті у байти
function parseRamBytes(capacityStr) {
    if (!capacityStr) return 0;
    const str = String(capacityStr).trim().toUpperCase();
    
    let multiplier = 1;
    let targetStr = str;
    if (str.includes('X')) {
        const parts = str.split('X');
        multiplier = parseFloat(parts[0]) || 1;
        targetStr = parts[1] || str;
    }
    
    const num = parseFloat(targetStr) || 0;
    
    if (targetStr.includes('GB') || targetStr.includes('ГБ')) {
        return num * multiplier * 1_000_000_000;
    } else if (targetStr.includes('MB') || targetStr.includes('МБ')) {
        return num * multiplier * 1_000_000;
    }
    
    return num * multiplier * 1_000_000_000;
}

function calculatePerformance(build) {
    if (!build) {
        return { error: "❌ Комп'ютер порожній! Спочатку зберіть ПК." };
    }

    const comp = build.components || build;
    const { cpu, gpu, ram, motherboard, storage, psu } = comp;

    const hasGpu = !!gpu || !!(cpu && cpu.igpu);

    if (!cpu || !hasGpu || !ram || !motherboard || !storage || !psu) {
        return { 
            error: "❌ Збірка неповна! Перевірте, чи встановлені CPU, RAM, материнка, накопичувач, БЖ та відеокарта (або проц з встройков)." 
        };
    }

    if (cpu.socket !== motherboard.socket) {
        return { 
            error: `❌ Несумісність! Сокет процесора (${cpu.socket}) не підходить до материнської плати (${motherboard.socket}).` 
        };
    }

    if (ram.ramType && motherboard.ramType && ram.ramType !== motherboard.ramType) {
        return { 
            error: `❌ Несумісність! Тип ОЗП (${ram.ramType}) не підтримується материнською платою (${motherboard.ramType}).` 
        };
    }

    const cpuPowerDraw = cpu.power || cpu.consumption || 65;
    
    let gpuPowerDraw = 0;
    if (gpu) {
        gpuPowerDraw = gpu.power || gpu.consumption || 120;
    } else if (cpu && cpu.igpu) {
        gpuPowerDraw = 15;
    }

    const totalPowerDraw = cpuPowerDraw + gpuPowerDraw + 50;

    const psuWattage = psu.wattage || 0;
    if (psuWattage < totalPowerDraw) {
        return { 
            error: `❌ Брак живлення! Збірка споживає ~${totalPowerDraw} Вт, а ваш БЖ видає лише ${psuWattage} Вт.` 
        };
    }

    const cpuScore = (cpu.cores || 1) * 100;

    let gpuScore = 0;
    let gpuModelName = "Немає";

    if (gpu) {
        const vramGb = gpu.vram ? parseInt(gpu.vram) : 1;
        const gpuPowerVal = gpu.power || gpu.consumption || 50;
        gpuScore = gpuPowerVal * (vramGb * 0.8);
        gpuModelName = gpu.model;
    } else if (cpu && cpu.igpu) {
        gpuScore = 45; 
        gpuModelName = `Вбудована (${cpu.igpu})`;
    }

    const ramGb = ram.capacity ? parseInt(ram.capacity) : 4;
    const ramScore = ramGb * 5; 

    const storageScore = storage.speed || 100;

    const totalScore = Math.round((gpuScore * 0.65) + (cpuScore * 0.20) + (ramScore * 0.10) + (storageScore * 0.05));

    const maxGpuFps = gpuScore * 1.2;

    const rawCs2 = totalScore * 0.5;
    const rawEts2 = totalScore * 0.35;
    const rawGta5 = totalScore * 0.3;
    const rawCyberpunk = totalScore * 0.1;

    const gamePreset = getPreset(gpuScore);

    return {
        success: true,
        rating: {
            cpu: cpu.model,
            gpu: gpuModelName,
            ram: ram.model,
            storage: storage.model,
            total: totalScore
        },
        fps: {
            cs2: Math.min(Math.round(rawCs2), Math.round(maxGpuFps * 0.8)),
            ets2: Math.min(Math.round(rawEts2), Math.round(maxGpuFps * 0.6)),
            gta5: Math.min(Math.round(rawGta5), Math.round(maxGpuFps * 0.5)),
            cyberpunk: Math.min(Math.round(rawCyberpunk), Math.round(maxGpuFps * 0.15))
        },
        presets: {
            cs2: gamePreset,
            ets2: gamePreset,
            gta5: gamePreset,
            cyberpunk: gamePreset
        },
        temp: 65,
        consumption: totalPowerDraw
    };
}

function calculateSystem(build) {
    return calculatePerformance(build);
}

// Усі функції в експорті (parseRamBytes додано сюди)
module.exports = { 
    canInstallComponent, 
    calculatePerformance, 
    calculateSystem,
    parseRamBytes 
};
