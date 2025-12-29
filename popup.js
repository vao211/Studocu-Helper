function updateStatus(msg, isProcessing = false) {
    const statusText = document.getElementById('status-text');
    const statusBar = document.getElementById('status');
    
    if (statusText && statusBar) {
        statusText.innerText = msg;
        if (isProcessing) {
            statusBar.classList.add('processing');
        } else {
            statusBar.classList.remove('processing');
        }
    }
}

// Button: Delete Cookies & Reload
document.getElementById('clearBtn').addEventListener('click', async () => {
    updateStatus("Đang quét và xóa cookie...", true);
    try {
        const allCookies = await chrome.cookies.getAll({});
        let count = 0;
        for (const cookie of allCookies) {
            if (cookie.domain.includes('studocu')) {
                let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
                const protocol = cookie.secure ? "https:" : "http:";
                const url = `${protocol}//${cleanDomain}${cookie.path}`;
                await chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId });
                count++;
            }
        }
        updateStatus(`Đã xóa ${count} cookies! Đang tải lại...`, false);
        setTimeout(() => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if(tabs[0]) chrome.tabs.reload(tabs[0].id);
            });
        }, 1000);
    } catch (e) {
        updateStatus("Lỗi: " + e.message, false);
    }
});

// Button: Create PDF
document.getElementById('checkBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    updateStatus("Đang khởi tạo...", true);

    await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["viewer_styles.css"]
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runEnhancedViewer
    }, () => {
        updateStatus("Đang chờ lệnh in...", false);
    });
});

async function runEnhancedViewer() {
    async function autoScroll() {
        return new Promise((resolve) => {
            const distance = 100;
            const delay = 50; 
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                const scrollTop = window.scrollY;
                const viewportHeight = window.innerHeight;

                window.scrollBy(0, distance);
                if ((scrollTop + viewportHeight) >= scrollHeight - 50) {
                    clearInterval(timer);
                    resolve();
                }
            }, delay);
        });
    }

    function waitForImages(container) {
        const images = Array.from(container.querySelectorAll('img'));
        if (images.length === 0) return Promise.resolve();

        const promises = images.map(img => {
            if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        });
        return Promise.all(promises);
    }

    function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false, heightScaleDivisor = 4, widthScaleDivisor = 4, shouldScaleMargin = false, marginScaleDivisor = 4) {
        const computedStyle = window.getComputedStyle(source);
        const normalProps = ['position', 'left', 'top', 'bottom', 'right', 'font-family', 'font-weight', 'font-style', 'color', 'background-color', 'text-align', 'white-space', 'display', 'visibility', 'opacity', 'z-index', 'text-shadow', 'padding'];
        const scaleProps = ['font-size', 'line-height'];
        let styleString = '';
        
        normalProps.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'normal') styleString += `${prop}: ${value} !important; `;
        });

        // Xử lý Width/Height/Margin 
        const widthValue = computedStyle.getPropertyValue('width');
        if (widthValue && widthValue !== 'none' && widthValue !== 'auto') {
            if (shouldScaleWidth) {
                const numValue = parseFloat(widthValue);
                if (!isNaN(numValue) && numValue > 0) styleString += `width: ${numValue / widthScaleDivisor}${widthValue.replace(numValue.toString(), '')} !important; `;
                else styleString += `width: ${widthValue} !important; `;
            } else styleString += `width: ${widthValue} !important; `;
        }
        
        const heightValue = computedStyle.getPropertyValue('height');
        if (heightValue && heightValue !== 'none' && heightValue !== 'auto') {
            if (shouldScaleHeight) {
                const numValue = parseFloat(heightValue);
                if (!isNaN(numValue) && numValue > 0) styleString += `height: ${numValue / heightScaleDivisor}${heightValue.replace(numValue.toString(), '')} !important; `;
                else styleString += `height: ${heightValue} !important; `;
            } else styleString += `height: ${heightValue} !important; `;
        }

        ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'auto') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    if (shouldScaleMargin && numValue !== 0) styleString += `${prop}: ${numValue / marginScaleDivisor}${value.replace(numValue.toString(), '')} !important; `;
                    else styleString += `${prop}: ${value} !important; `;
                }
            }
        });

        scaleProps.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && numValue !== 0) styleString += `${prop}: ${numValue / scaleFactor}${value.replace(numValue.toString(), '')} !important; `;
                else styleString += `${prop}: ${value} !important; `;
            }
        });

        let transformOrigin = computedStyle.getPropertyValue('transform-origin');
        if (transformOrigin) styleString += `transform-origin: ${transformOrigin} !important; `;
        
        styleString += 'overflow: visible !important; max-width: none !important; max-height: none !important; ';
        target.style.cssText += styleString;
    }

    function deepCloneWithStyles(element, scaleFactor, heightScaleDivisor) {
        const clone = element.cloneNode(false);
        const hasTextClass = element.classList && element.classList.contains('t');
        const hasUnderscoreClass = element.classList && element.classList.contains('_');
        const shouldScaleMargin = element.tagName === 'SPAN' && element.classList && element.classList.contains('_');
        
        copyComputedStyle(element, clone, scaleFactor, hasTextClass, hasUnderscoreClass, heightScaleDivisor, 4, shouldScaleMargin, scaleFactor);
        
        if (element.classList && element.classList.contains('pc')) {
            clone.style.transform = 'none';
            clone.style.overflow = 'visible';
        }
        
        if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
            clone.textContent = element.textContent;
        } else {
            element.childNodes.forEach(child => {
                if (child.nodeType === 1) clone.appendChild(deepCloneWithStyles(child, scaleFactor, heightScaleDivisor));
                else if (child.nodeType === 3) clone.appendChild(child.cloneNode(true));
            });
        }
        return clone;
    }


    if (confirm("Bạn có muốn tự động cuộn trang để tải toàn bộ nội dung không?\n(Khuyên dùng để tránh mất trang)")) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);color:white;display:flex;justify-content:center;align-items:center;z-index:999999;font-size:24px;';
        overlay.innerText = "Đang cuộn trang... Vui lòng đợi...";
        document.body.appendChild(overlay);
        
        await autoScroll();
        
        document.body.removeChild(overlay);
    }

    const pages = document.querySelectorAll('div[data-page-index]');
    if (pages.length === 0) {
        alert("⚠️ Không tìm thấy trang nào.\nHãy thử tải lại trang hoặc cuộn thủ công.");
        return;
    }

    // Render lại
    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'clean-viewer-container';
    const SCALE_FACTOR = 4;
    const HEIGHT_SCALE_DIVISOR = 4;

    pages.forEach((page, index) => {
        const pc = page.querySelector('.pc');
        let width = 595.3; 
        let height = 841.9;

        if (pc) {
            const pcStyle = window.getComputedStyle(pc);
            width = parseFloat(pcStyle.width) || width;
            height = parseFloat(pcStyle.height) || height;
        }
        
        const newPage = document.createElement('div');
        newPage.className = 'std-page';
        newPage.id = `page-${index + 1}`;
        newPage.style.width = width + 'px';
        newPage.style.height = height + 'px';

        // Xử lý ảnh nền
        const originalImg = page.querySelector('img.bi') || page.querySelector('img');
        if (originalImg) {
            const bgLayer = document.createElement('div');
            bgLayer.className = 'layer-bg';
            const imgClone = originalImg.cloneNode(true);
            imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
            bgLayer.appendChild(imgClone);
            newPage.appendChild(bgLayer);
        }

        // Xử lý text
        const originalPc = page.querySelector('.pc');
        if (originalPc) {
            const textLayer = document.createElement('div');
            textLayer.className = 'layer-text';
            const pcClone = deepCloneWithStyles(originalPc, SCALE_FACTOR, HEIGHT_SCALE_DIVISOR);
            pcClone.querySelectorAll('img').forEach(img => img.style.display = 'none');
            textLayer.appendChild(pcClone);
            newPage.appendChild(textLayer);
        }

        viewerContainer.appendChild(newPage);
    });

    document.body.appendChild(viewerContainer);

    // Đợi tất cả ảnh tải xong
    // Thay thế cho setTimeout 1s cố định
    const overlayWait = document.createElement('div');
    overlayWait.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);color:white;display:flex;justify-content:center;align-items:center;z-index:999999;font-size:20px;';
    overlayWait.innerText = "Đang xử lý hình ảnh cho bản in...";
    document.body.appendChild(overlayWait);

    await waitForImages(viewerContainer);

    document.body.removeChild(overlayWait);

    window.print();
}