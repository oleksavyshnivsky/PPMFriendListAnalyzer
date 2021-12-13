// ==UserScript==
// @name         PPMFriendListAnalyzer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       Oleksa Vyshnivsky <dying.escape@gmail.com>
// @match        https://ppm.powerplaymanager.com/*
// @icon         https://www.google.com/s2/favicons?domain=powerplaymanager.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // ————————————————————————————————————————————————————————————————————————————————
    // FRIENDS item structure:
    // FRIENDS[uid] = {
    //  uid: PPM user id
    //  name: PPM username
    //  img: Full URL to the PPM user photo
    //  lastinlist: Last time user was seen in the friend list
    //  lastlogin: Datetime of last login to PPM
    //  lastcheck: Last time the user profile was checked
    //  teams: Amount of teams of this user
    // }
    // ————————————————————————————————————————————————————————————————————————————————
    var FRIENDS = {}
    const URLBASE_FRIENDS = 'https://ppm.powerplaymanager.com/en/friends.html?data=all-'
    const URLBASE_PROFILE = 'https://ppm.powerplaymanager.com/en/manager-profile.html?data='
    const URLBASE_UNFRIEND = 'https://ppm.powerplaymanager.com/en/friends.html?data=removefriend-'
    // Warn about those who were last online more than 14, 21, 50 days ago
    // Days ago * 24 * 60 * 60 * 1000
    const TIMEDIFF_WARNING = 14 * 24 * 60 * 60 * 1000
    const TIMEDIFF_RED_SIMPLE = 21 * 24 * 60 * 60 * 1000
    const TIMEDIFF_RED_PRO = 50 * 24 * 60 * 60 * 1000
    // Do not check those who were checked less than 12 hours ago
    const RECENT_CHECK_PERIOD = 12 * 24 * 60 * 60 * 1000
    // Pause after request to lower the load on the website, ms
    const REQUEST_PAUSE = 100
    // Amount of friend profiles to check in one run
    const FRIENDS_PER_RUN = 50
    // ————————————————————————————————————————————————————————————————————————————————
    //
    // ————————————————————————————————————————————————————————————————————————————————
    const TXT = {
        CHECK_FRIENDS: 'Check up to ' + FRIENDS_PER_RUN + ' friends',
        FRIENDS_GOTTEN: 'List of friends has been read',
        FRIENDS_CHECKED: 'Friends checked', // Friends checked: {number}
        GET_FRIENDS: 'Read the friend list',
        LS_CLEAR: 'Before uninstall',
        LS_CLEAR_CONFIRMATION: 'This action will remove data of this userscript from the local storage. Please confirm this action',
        LS_CLEARED: 'Local storage is cleared. Userscript can be deleted',
        SHOW_FRIENDS: 'Show friends',
        TEAMS: 'Teams',
        TITLE: 'Last logins',
        WARNING_NOWRAPPER: 'Please switch to the Community/Friends page',
        //
        TOTAL: 'Friends in total',
        NOT_CHECKED: 'Not checked', // 'Not checked recently'
        LEVEL_ORANGE: '15—21 days ago',
        LEVEL_RED: '22—50 days ago',
        LEVEL_RED_PRO: '51+ days ago',
        //
        UNFRIEND: 'Unfriend',
        CONFIRM: 'Are you sure?',
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Local storage
    // ————————————————————————————————————————————————————————————————————————————————
    function saveToLS() {
        localStorage.setItem('ppm-friends', JSON.stringify(FRIENDS))
    }
    function loadFromLS() {
        try {
            FRIENDS = JSON.parse(localStorage.getItem('ppm-friends'))
            Object.keys(FRIENDS).forEach(i => {
                FRIENDS[i].lastinlist = new Date(FRIENDS[i].lastinlist)
                FRIENDS[i].lastcheck = new Date(FRIENDS[i].lastcheck)
                FRIENDS[i].lastlogin = new Date(FRIENDS[i].lastlogin)
            })
        } catch(e) {
            FRIENDS = {}
        }
    }
    function removeFromLS() {
        localStorage.removeItem('ppm-friends')
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Scrolling
    // ————————————————————————————————————————————————————————————————————————————————
    function scrollToElement(el) {
        if (el) el.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'nearest'})
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Styling — taken from http://davidwalsh.name/add-rules-stylesheets
    // ————————————————————————————————————————————————————————————————————————————————
    var sheet = (function() {
        // Create the <style> tag
        var style = document.createElement('style')
        // WebKit hack :(
        style.appendChild(document.createTextNode(''))
        // Add the <style> element to the page
        document.head.appendChild(style)
        return style.sheet
    })()
    // ————————————————————————————————————————————————————————————————————————————————
    function addCSSRule(sheet, selector, rules, index) {
        if('insertRule' in sheet) {
            sheet.insertRule(selector + '{' + rules + '}', index)
        }
        else if('addRule' in sheet) {
            sheet.addRule(selector, rules, index)
        }
    }
    // ————————————————————————————————————————————————————————————————————————————————
    addCSSRule(sheet, "#us-controlboard", "position: fixed; display: block; top: 0px; right: -150px; background-color: whitesmoke; z-index: 100; width: 170px; transition: right .1s ease;")
    addCSSRule(sheet, "#us-controlboard:hover", "right: 0px;")
    addCSSRule(sheet, "#us-controlboard label", "color: black;")
    addCSSRule(sheet, '.us-btn-wrapper', 'padding: 5px;')
    addCSSRule(sheet, '.us-btn-wrapper button', 'width: 100%;')
    addCSSRule(sheet, '.wrapper', 'padding: 5px;')
    // ————————————————————————————————————————————————————————————————————————————————
    //
    // ————————————————————————————————————————————————————————————————————————————————
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // AJAX request
    // options:
    //  - method — POST|GET
    //  - url
    //  - data
    //  - dataType
    // ————————————————————————————————————————————————————————————————————————————————
    const AJAX = options => {
        return new Promise((resolve, reject) => {
            const baseoptions = {method: 'GET', url: false, data: false, dataType: 'auto'}
            options = {...baseoptions, ...options} // НЕ ЗМІНЮВАТИ НА **var options = ...**
            var xhr = new XMLHttpRequest()
            xhr.open(options.method, options.url)
            // if (options.method === 'POST') xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
            if (options.method === 'GET') console.log('Loading ' + options.url)
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
            xhr.onload = function() {
                if (xhr.status === 200) {
                    var response = false
                    if (options.dataType === 'json') {
                        try {
                            response = JSON.parse(xhr.response)
                        } catch (e) {
                            reject(xhr)
                        }
                    } else if (options.dataType === 'text/html') {
                        try {
                            response = new DOMParser().parseFromString(xhr.response, 'text/html')
                        } catch (e) {
                            reject(xhr)
                        }
                    } else if (options.dataType === 'text/plain') {
                        try {
                            response = xhr.response
                        } catch (e) {
                            reject(xhr)
                        }
                    } else {
                        try {
                            response = JSON.parse(xhr.response)
                        } catch (e) {
                            try {
                                response = new DOMParser().parseFromString(xhr.response, 'text/html')
                            } catch (e) {
                                response = xhr.response
                                // reject(xhr.statusText)
                            }
                        }
                    }
                    resolve(response)
                } else {
                    reject(xhr)
                }
            }
            xhr.send(options.data)
        })
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Get the source code of the asked GPRO page
    // ————————————————————————————————————————————————————————————————————————————————
    async function getSourceCode(sourceURL, parse = false) {
        await sleep(REQUEST_PAUSE)
        return new Promise((resolve, reject) => {
            if (sourceURL === window.location.href) resolve(parse ? document : document.querySelector('html').outerHTML)
            else {
                AJAX({
                    url: sourceURL,
                    dataType: 'text/plain'
                }).then(response => {
                    resolve(parse ? new DOMParser().parseFromString(response, 'text/html') : response)
                }).catch(xhr => {
                    console.log(sourceURL + ' was not received due to error: ' + xhr.statusText)
                    reject(xhr.statusText)
                })
            }
        })
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Get the list of friends from the Friends page(s)
    // ————————————————————————————————————————————————————————————————————————————————
    async function getFriends() {
        CB.toggle(false)
        const NOW = new Date()
        // Load first page
        var doc = await getSourceCode(URLBASE_FRIENDS + '1', true)
        // Get the amount of pages
        var pages = doc.querySelector('.pagination').innerText.match(/^\d+|\d+\b|\d+(?=\w)/g)
        var lastpage = parseInt(pages[pages.length - 1])
        // Go through pages
        for (var page = 1; page < lastpage + 1; page++) {
            if (page > 1) doc = await getSourceCode(URLBASE_FRIENDS + page, true)
            var els = doc.querySelectorAll('.forum_post')
            for (var i = 0; i < els.length; i++) {
                var el = els[i]
                var a = el.querySelector('.forum_post_name a[href*="manager-profile"]')
                var uid = parseInt(a.href.match(/^\d+|\d+\b|\d+(?=\w)/g)[0])
                var name = a.innerText.trim()
                var img = el.querySelector('img[src*="manager_photo"]').src
                if (typeof FRIENDS[uid] === 'undefined') {
                    // Add friend info
                    FRIENDS[uid] = {
                        uid: uid,
                        name: name,
                        img: img,
                        lastinlist: NOW,
                        lastlogin: null,
                        lastcheck: null,
                        teams: null,
                    }
                } else {
                    // Update friend info
                    FRIENDS[uid].name = name
                    FRIENDS[uid].img = img
                    FRIENDS[uid].lastinlist = NOW
                }
            }
        }
        // Remove unfriended
        Object.keys(FRIENDS).forEach(i => {
            if (FRIENDS[i].lastinlist !== NOW) delete FRIENDS[i]
        })
        //
        saveToLS()
        showStatus()
        CB.toggle(true)
        alert(TXT.FRIENDS_GOTTEN)
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Check profiles, get recent login datetimes
    // ————————————————————————————————————————————————————————————————————————————————
    async function checkFriends() {
        CB.toggle(false)
        const NOW = new Date()
        var checked = 0
        for (var i = 0; i < Object.keys(FRIENDS).length; i++) {
            var friend = FRIENDS[Object.keys(FRIENDS)[i]]
            // Don't check nore often than once a twelve hours
            // if (typeof friend.lastcheck === 'string') friend.lastcheck = new Date(friend.lastcheck)
            if (NOW - friend.lastcheck > RECENT_CHECK_PERIOD) {
                // Load profile
                var doc = await getSourceCode(URLBASE_PROFILE + friend.uid, true)
                // Amount of teams
                friend.teams = doc.querySelectorAll('.team_info_profile').length
                // Most recent login
                var tbl = doc.querySelectorAll('.table_profile')[1]
                friend.lastlogin = new Date(tbl.querySelector('td').innerText)
                // Last check — now
                friend.lastcheck = new Date()
                // Amount of checked
                checked++
                if (checked >= FRIENDS_PER_RUN) break
            }
        }
        //
        saveToLS()
        showStatus()
        CB.toggle(true)
        alert(TXT.FRIENDS_CHECKED + ': ' + checked)
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // UNFRIEND — NOT USED
    // ————————————————————————————————————————————————————————————————————————————————
    function unfriend(e) {
        if (confirm(TXT.CONFIRM)) {
            var uid = e.target.dataset.uid
            var sourceURL = URLBASE_UNFRIEND + uid
            AJAX({
                url: sourceURL,
                dataType: 'text/plain'
            }).then(response => {
                document.getElementById('friend-wrapper-' + uid).delete()
                delete FRIENDS[uid]
                saveToLS()
            }).catch(xhr => {
                console.log(sourceURL + ' was not received due to error: ' + xhr.statusText)
            })
        }
    }
    // ————————————————————————————————————————————————————————————————————————————————
    //
    // ————————————————————————————————————————————————————————————————————————————————
    function showStatus() {
        const NOW = new Date()
        var notCheckedRecently = 0
        var total = 0
        var redpro = 0
        var red = 0
        var warning = 0
        Object.keys(FRIENDS).forEach(i => {
            var friend = FRIENDS[i]
            total++
            if (NOW - friend.lastcheck > RECENT_CHECK_PERIOD) notCheckedRecently++
            else {
                if (NOW - friend.lastlogin > TIMEDIFF_RED_PRO) redpro++
                else if (NOW - friend.lastlogin > TIMEDIFF_RED_SIMPLE) red++
                else if (NOW - friend.lastlogin > TIMEDIFF_WARNING) warning++
            }
        })
        //
        var res = TXT.TOTAL + ': ' + total
        res += '<br>' + TXT.NOT_CHECKED + ': ' + (notCheckedRecently?notCheckedRecently:'—')
        res += '<br>' + TXT.LEVEL_ORANGE + ': ' + (warning?warning:'—')
        res += '<br>' + TXT.LEVEL_RED + ': ' + (red?red:'—')
        res += '<br>' + TXT.LEVEL_RED_PRO + ': ' + (redpro?redpro:'—')
        document.getElementById('us-status').innerHTML = '<p>' + res + '</p>'

    }
    // ————————————————————————————————————————————————————————————————————————————————
    //
    // ————————————————————————————————————————————————————————————————————————————————
    function showFriends() {
        const NOW = new Date()
        const listWrapper = document.querySelector('.column_center_half .white_box')
        if (!listWrapper) {
            alert(TXT.WARNING_NOWRAPPER)
            return false
        }
        listWrapper.innerHTML = ''
        var friends = []
        Object.keys(FRIENDS).forEach(i => friends.push(FRIENDS[i]))
        friends.sort((x, y) => x.lastlogin < y.lastlogin ? -1 : (x.lastlogin > y.lastlogin ? 1 : 0))
        friends.forEach(friend => {
            var wrapper = document.createElement('div')
            wrapper.id = 'friend-wrapper-' + friend.uid
            wrapper.classList.add('forum_post')
            wrapper.classList.add('gray_box')
            wrapper.style.display = 'inline-block'
            wrapper.style.margin = '2px'
            var imgwrapper = document.createElement('div')
            imgwrapper.classList.add('forum_post_image')
            imgwrapper.style.width = '70px'
            wrapper.appendChild(imgwrapper)
            var imgwrappera = document.createElement('a')
            imgwrappera.href = URLBASE_PROFILE + friend.uid
            imgwrappera.target = '_blank'
            imgwrapper.appendChild(imgwrappera)
            var img = document.createElement('img')
            img.src = friend.img
            imgwrappera.appendChild(img)
            var rightwrapper = document.createElement('div')
            rightwrapper.classList.add('forum_post_right')
            rightwrapper.style.width = '149px'
            wrapper.appendChild(rightwrapper)
            var namewrapper = document.createElement('div')
            namewrapper.style.fontWeight = 'bold'
            rightwrapper.appendChild(namewrapper)
            var namewrappera = document.createElement('a')
            namewrappera.href = URLBASE_PROFILE + friend.uid
            namewrappera.target = '_blank'
            namewrappera.innerText = friend.name
            namewrapper.appendChild(namewrappera)
            var p = document.createElement('div')
            p.innerText = friend.lastlogin.toLocaleString()
            if (NOW - friend.lastlogin > TIMEDIFF_RED_PRO) {
                p.style.color = 'red'
                p.style.fontWeight = 'bold'
            } else if (NOW - friend.lastlogin > TIMEDIFF_RED_SIMPLE) {
                p.style.color = 'red'
            } else if (NOW - friend.lastlogin > TIMEDIFF_WARNING) {
                p.style.color = 'orange'
            }
            rightwrapper.appendChild(p)
            var p1 = document.createElement('div')
            p1.innerText = TXT.TEAMS + ': ' + (friend.teams?friend.teams:'—')
            if (friend.teams === 0) {
                p1.style.color = 'red'
                p1.style.fontWeight = 'bold'
            }
            rightwrapper.appendChild(p1)
            // ————————————————————————————————————————————————————————————————————————————————
            // UNFRIEND
            // ————————————————————————————————————————————————————————————————————————————————
            if (NOW - friend.lastlogin > TIMEDIFF_RED_PRO && false) {
                var unfriendwrapper = document.createElement('p')
                rightwrapper.appendChild(unfriendwrapper)
                var unfrienda = document.createElement('a')
                unfrienda.href = 'javascript:void(0)'
                unfrienda.dataset.uid = friend.uid
                unfrienda.onclick = unfriend
                unfrienda.innerText = TXT.UNFRIEND
                unfriendwrapper.appendChild(unfrienda)
            }
            // ————————————————————————————————————————————————————————————————————————————————
            //
            // ————————————————————————————————————————————————————————————————————————————————
            listWrapper.appendChild(wrapper)
        })
        scrollToElement(listWrapper)
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Before uninstal
    // ————————————————————————————————————————————————————————————————————————————————
    function beforeUninstall() {
        if (confirm(TXT.LS_CLEAR_CONFIRMATION)) {
            removeFromLS()
            alert(TXT.LS_CLEARED)
        }
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // BUTTONS
    // ————————————————————————————————————————————————————————————————————————————————
    function addButtonToControlBoard(id, title, action) {
        var wrapper = document.createElement('div'); wrapper.classList.add('us-btn-wrapper')
        var btn = document.createElement('button'); btn.id = id; btn.innerText = title; btn.onclick = action; wrapper.append(btn)
        CB.appendChild(wrapper)
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Control board
    // ————————————————————————————————————————————————————————————————————————————————
    const CB = document.createElement('div')
    CB.id = 'us-controlboard'
    CB.create = () => {
        // Check if control board was not added earlier
        if (CB.created) return false

        var header = document.createElement('h3')
        header.innerText = TXT.TITLE
        header.style.textAlign = 'center'
        CB.appendChild(header)

        addButtonToControlBoard('btnGetFriends', TXT.GET_FRIENDS, getFriends)
        addButtonToControlBoard('btnCheckFriends', TXT.CHECK_FRIENDS, checkFriends)
        addButtonToControlBoard('btnShowFriends', TXT.SHOW_FRIENDS, showFriends)
        addButtonToControlBoard('btnBeforeUninstall', TXT.LS_CLEAR, beforeUninstall)

        // Information field
        var infobox = document.createElement('div')
        infobox.id = 'us-status'
        infobox.classList.add('wrapper')
        CB.append(infobox)

        CB.created = true
        document.body.appendChild(CB)
    }
    CB.toggle = forced => {
        CB.style.display = typeof forced === 'undefined' ? (CB.style.display ? '' : 'none') : (forced ? '' : 'none')
    }
    // ————————————————————————————————————————————————————————————————————————————————
    // Starting actions
    // ————————————————————————————————————————————————————————————————————————————————
    loadFromLS()
    CB.create()
    showStatus()
})();

