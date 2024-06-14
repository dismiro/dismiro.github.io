
	function TextField(text) {
        this.Init(text)
        this.isEdit = false
    }
    TextField.prototype.Init = function(text) {
        this.text = text
        this.texts = text.split('\n')
        this.index = 0
        this.offset = text.length
        this.ClearSelection()
    }
    TextField.prototype.StartEdit = function() {
        this.index = this.texts.length - 1
        this.offset = this.texts[this.index].length
        this.isEdit = true
        this.SelectAll()
    }
    TextField.prototype.EndEdit = function() {
        this.isEdit = false
        this.ClearSelection()
    }
    TextField.prototype.IsStartLessThanEnd = function() {
        if (this.selectionStartIndex != this.selectionEndIndex) return this.selectionStartIndex < this.selectionEndIndex
        return this.selectionStartOffset <= this.selectionEndOffset
    }
    TextField.prototype.HaveSelection = function() {
        return this.selectionStartIndex > -1 && this.selectionEndIndex > -1
    }
    TextField.prototype.ClearSelection = function() {
        this.selectionStartIndex = -1
        this.selectionStartOffset = -1
        this.selectionEndIndex = -1
        this.selectionEndOffset = -1
    }
    TextField.prototype.StartSelection = function() {
        this.selectionStartIndex = this.index
        this.selectionStartOffset = this.offset
    }
    TextField.prototype.SelectAll = function() {
        this.index = this.texts.length - 1
        this.offset = this.texts[this.texts.length - 1].length
        this.selectionStartIndex = 0
        this.selectionStartOffset = 0
        this.selectionEndIndex = this.index
        this.selectionEndOffset = this.offset
    }
    TextField.prototype.MoveCursorHorizontally = function(dx, shiftKey) {
        if (!shiftKey && this.HaveSelection()) {
            this.index = this.IsStartLessThanEnd() ^ (dx > 0) ? this.selectionStartIndex : this.selectionEndIndex
            this.offset = this.IsStartLessThanEnd() ^ (dx > 0) ? this.selectionStartOffset : this.selectionEndOffset
            this.ClearSelection()
            return
        }
        this.offset += dx
        if (this.offset > this.texts[this.index].length) {
            if (this.index < this.texts.length - 1) {
                this.offset = 0
                this.index++
            } else {
                this.offset = this.texts[this.index].length
            }
        } else if (this.offset < 0) {
            if (this.index > 0) {
                this.offset = this.texts[this.index - 1].length
                this.index--
            } else {
                this.offset = 0
            }
        }
    }
    TextField.prototype.MoveCursorVertically = function(dy, shiftKey) {
        if (!shiftKey && this.HaveSelection()) {
            this.index = this.IsStartLessThanEnd() ^ (dy > 0) ? this.selectionStartIndex : this.selectionEndIndex
            this.offset = this.IsStartLessThanEnd() ^ (dy > 0) ? this.selectionStartOffset : this.selectionEndOffset
            this.ClearSelection()
        }
        let dx = this.offset - Math.round(this.texts[this.index].length / 2)
        this.index = this.index + dy
        if (this.index < 0) {
            this.index = 0
            this.offset = 0
        } else if (this.index >= this.texts.length) {
            this.index = this.texts.length - 1
            this.offset = this.texts[this.index].length
        } else {
            this.offset = this.texts[this.index].length / 2 + dx
            this.offset = Math.max(0, Math.min(this.texts[this.index].length, Math.round(this.offset)))
        }
    }
    TextField.prototype.IsSpace = function() {
        return /[\s.\[\]\(\)\{\}]/.test(this.texts[this.index][this.offset])
    }
    TextField.prototype.FindNextNonSpace = function() {
        if (this.offset == this.texts[this.index].length) {
            if (this.index < this.texts.length - 1) {
                this.index++
                    this.offset = 0
            }
            return
        }
        this.offset++
            while (this.offset < this.texts[this.index].length && !this.IsSpace()) this.offset++
                while (this.offset < this.texts[this.index].length && this.IsSpace()) this.offset++
    }
    TextField.prototype.FindPrevNonSpace = function() {
        if (this.offset == 0) {
            if (this.index > 0) {
                this.index--
                    this.offset = this.texts[this.index].length
            }
            return
        }
        this.offset--
            while (this.offset > 0 && this.IsSpace()) this.offset--
                while (this.offset > 0 && !this.IsSpace()) this.offset--
                    if (this.offset > 0 && this.IsSpace()) this.offset++
    }
    TextField.prototype.MoveCursor = function(key, ctrlKey, shiftKey) {
        if (shiftKey && !this.HaveSelection()) this.StartSelection()
        if (key == 'ArrowLeft') {
            if (ctrlKey) {
                this.FindPrevNonSpace()
            } else {
                this.MoveCursorHorizontally(-1, shiftKey)
            }
        } else if (key == 'ArrowRight') {
            if (ctrlKey) {
                this.FindNextNonSpace()
            } else {
                this.MoveCursorHorizontally(1, shiftKey)
            }
        } else if (key == 'ArrowUp') {
            this.MoveCursorVertically(-1, shiftKey)
        } else if (key == 'ArrowDown') {
            this.MoveCursorVertically(1, shiftKey)
        } else if (key == 'Home') {
            this.offset = 0
        } else if (key == 'End') {
            this.offset = this.texts[this.index].length
        }
        if (!shiftKey) {
            this.ClearSelection()
        } else {
            this.selectionEndIndex = this.index
            this.selectionEndOffset = this.offset
        }
    }
    TextField.prototype.RemoveSelection = function() {
        if (!this.HaveSelection()) return false
        if (!this.IsStartLessThanEnd()) {
            let index = this.selectionStartIndex
            this.selectionStartIndex = this.selectionEndIndex
            this.selectionEndIndex = index
            let offset = this.selectionStartOffset
            this.selectionStartOffset = this.selectionEndOffset
            this.selectionEndOffset = offset
        }
        let endText = this.texts[this.selectionEndIndex].substr(this.selectionEndOffset)
        for (let index = this.selectionEndIndex; index > this.selectionStartIndex; index--) this.texts.splice(index, 1)
        this.texts[this.selectionStartIndex] = this.texts[this.selectionStartIndex].substr(0, this.selectionStartOffset) + endText
        this.index = this.selectionStartIndex
        this.offset = Math.min(this.selectionStartOffset, this.selectionEndOffset)
        this.text = this.texts.join("\n")
        this.texts = this.text.split('\n')
        this.ClearSelection()
        return true
    }
    TextField.prototype.BackspaceProcess = function(ctrlKey) {
        if (this.RemoveSelection()) return
        if (this.index == 0 && this.offset == 0) return
        if (ctrlKey) {
            let index = this.index
            let offset = this.offset
            this.FindPrevNonSpace()
            this.texts[this.index] = this.texts[this.index].substr(0, this.offset) + this.texts[index].substr(offset)
            if (index != this.index) {
                this.texts.splice(index, 1)
            }
        } else if (this.offset > 0) {
            this.offset--
                this.texts[this.index] = this.texts[this.index].substr(0, this.offset) + this.texts[this.index].substr(this.offset + 1)
        } else {
            this.index--
                this.offset = this.texts[this.index].length
            this.texts[this.index] += this.texts[this.index + 1]
            this.texts.splice(this.index + 1, 1)
        }
        this.text = this.texts.join('\n')
    }
    TextField.prototype.DeleteProcess = function(ctrlKey, shiftKey) {
        if (shiftKey) {
            this.Init('')
            return
        }
        if (this.RemoveSelection()) return
        if (this.index == this.texts.length - 1 && this.offset == this.texts[this.index].length) return
        if (ctrlKey) {
            let index = this.index
            let offset = this.offset
            this.FindNextNonSpace()
            this.texts[index] = this.texts[index].substr(0, offset) + this.texts[this.index].substr(this.offset)
            if (index != this.index) this.texts.splice(this.index, 1)
            this.index = index
            this.offset = offset
        } else if (this.offset < this.texts[this.index].length) {
            this.texts[this.index] = this.texts[this.index].substr(0, this.offset) + this.texts[this.index].substr(this.offset + 1)
        } else {
            this.texts[this.index] += this.texts[this.index + 1]
            this.texts.splice(this.index + 1, 1)
        }
        this.text = this.texts.join('\n')
    }
    TextField.prototype.RemoveText = function(key, ctrlKey, shiftKey) {
        if (key == 'Backspace') {
            this.BackspaceProcess(ctrlKey)
        } else if (key == 'Delete') {
            this.DeleteProcess(ctrlKey, shiftKey)
        }
    }
    TextField.prototype.InsertText = function(text) {
        this.RemoveSelection()
        this.texts[this.index] = this.texts[this.index].substr(0, this.offset) + text + this.texts[this.index].substr(this.offset)
        this.text = this.texts.join('\n')
        this.texts = this.text.split('\n')
        let texts = text.split('\n')
        this.index += texts.length - 1
        this.offset = texts.length > 1 ? texts[texts.length - 1].length : this.offset + text.length
    }
    TextField.prototype.SwapTexts = function(from, to) {
        for (let i = 0; i < from.length; i++) {
            if (this.text == from[i]) {
                this.Init(to[i])
                break
            }
        }
    }
    TextField.prototype.GetSelectedText = function() {
        if (!this.HaveSelection()) return this.text
        let startIndex = this.selectionStartIndex
        let startOffset = this.selectionStartOffset
        let endIndex = this.selectionEndIndex
        let endOffset = this.selectionEndOffset
        if (endIndex < startIndex) {
            startIndex = this.selectionEndIndex
            startOffset = this.selectionEndOffset
            endIndex = this.selectionStartIndex
            endOffset = this.selectionStartOffset
        }
        if (startIndex == endIndex) {
            if (startOffset > endOffset) {
                startOffset = this.selectionEndOffset
                endOffset = this.selectionStartOffset
            }
            return this.texts[startIndex].substr(startOffset, endOffset - startOffset)
        }
        let texts = this.texts.slice(startIndex, endIndex + 1)
        texts[0] = this.texts[startIndex].substr(startOffset)
        texts[texts.length - 1] = this.texts[endIndex].substr(0, endOffset)
        return texts.join("\n")
    }
    TextField.prototype.ReplaceMathChars = function() {
        let text = this.texts[this.index]
        for (let i = 0; i < REPLACE_MATH_RULES.length; i++) {
            let template = REPLACE_MATH_RULES[i][0] + " "
            let replace = REPLACE_MATH_RULES[i][1]
            let start = this.offset - template.length
            if (text.substr(start, template.length) == template) {
                let left = this.texts[this.index].substr(0, start)
                let right = this.texts[this.index].substr(this.offset)
                this.texts[this.index] = left + replace + right
                this.offset = left.length + replace.length
            }
        }
    }
    const BLOCK_MODE = 'блоки'
    const CONNECTION_MODE = 'соединения'
    const ACTION_MOVE = 'move'
    const ACTION_CLICK = 'click'
    const ACTION_RESIZE = 'resize'
    const ACTION_SELECT = 'select'
    const ACTION_SELECTION_REMOVE = 'remove-selection'
    const ACTION_SELECTION_COPY = 'copy-selection'
    const ACTION_ADD_ARROW = 'add-arrow'
    const ACTION_REMOVE_ARROW = 'remove-arrow'
    const ACTION_CHANGE_ARROW = 'change-arrow'
    const ACTION_ADD_BLOCK = 'add-block'
    const ACTION_REMOVE_BLOCK = 'remove-block'
    const ACTION_INSERT_BLOCK = 'insert-block'
    const ACTION_EDIT_BLOCK = 'edit-block'
    const ACTION_CUT_TEXT = 'cut-text'
    const ACTION_PASTE_TEXT = 'paste-text'
    const ACTION_CHANGE_FORMATTING = 'change-formatting'
    const ACTION_CHANGE_FONT = 'change-font'
    const ACTION_CHANGE_ALIGNMENT = 'change-alignment'
    const ACTION_CHANGE_TYPE = 'change-type'
    const BLOCK_TYPE = 'Блок'
    const CONDITION_TYPE = 'Условие'
    const BEGIN_END_TYPE = 'Начало / конец'
    const PROCEDURE_TYPE = 'Подпрограмма'
    const IN_OUT_TYPE = 'Ввод / вывод'
    const DISPLAY_TYPE = 'Дисплей'
    const FOR_LOOP_TYPE = 'Цикл for'
    const FOR_LOOP_BEGIN_TYPE = 'Цикл for начало'
    const FOR_LOOP_END_TYPE = 'Цикл for конец'
    const LABEL_TYPE = 'Ссылка'
    const TEXT_TYPE = 'Текст / комментарий'
    const BOLD = 'bold'
    const ITALIC = 'italic'
    const INCREASE_FONT = 'increase-font'
    const DECREASE_FONT = 'decrease-font'
    const CLEAR_FORMAT = 'clear'
    const BLOCK_TYPES = [BLOCK_TYPE, CONDITION_TYPE, BEGIN_END_TYPE, PROCEDURE_TYPE, IN_OUT_TYPE, DISPLAY_TYPE, FOR_LOOP_TYPE, LABEL_TYPE, TEXT_TYPE]
    const ALL_BLOCK_TYPES = [BLOCK_TYPE, CONDITION_TYPE, BEGIN_END_TYPE, PROCEDURE_TYPE, IN_OUT_TYPE, DISPLAY_TYPE, FOR_LOOP_TYPE, FOR_LOOP_BEGIN_TYPE, FOR_LOOP_END_TYPE, LABEL_TYPE, TEXT_TYPE]
    const BLOCK_WIDTHS = [100, 100, 100, 100, 120, 120, 100, 30, 80]
    const BLOCK_HEIGHTS = [40, 40, 30, 40, 40, 40, 40, 30, 20]
    const MENU_ITEMS = ['Сохранить схему (json)', 'Загрузить схему (json)', 'Сохранить схему (png)', 'Сохранить области (zip)', 'Сменить цветовую тему', 'Инструкция к редактору']
    const KEYBOARD_CHARACTERS = ['∀', '∃', '∄', '←', '→', '⇔', '≠', '≡', '≤', '≥', '∈', '∉', '∅', 'ℤ', 'ℕ', '∩', '∪', '⊂', '⊃', '⊆', '⊇', '∧', '∨', '²', '³', '⋅', 'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'χ', 'φ', 'ψ', 'ω']
    const KEYBOARD_CHARACTERS_PER_ROW = 25
    const KEYBOARD_CHARACTERS_ROWS = Math.floor((KEYBOARD_CHARACTERS.length + KEYBOARD_CHARACTERS_PER_ROW - 1) / KEYBOARD_CHARACTERS_PER_ROW)
    const KEYBOARD_KEY_SIZE = 30
    const KEYBOARD_COLOR = ['#bbb', '#000']
    const KEYBOARD_ACTIVE_COLOR = ['#fff', '#2196f3']
    const KEYBOARD_ICON_FONT = (KEYBOARD_KEY_SIZE / 1.8) + "px sans-serif"
    const TOP_CONNECTOR = 0
    const RIGHT_CONNECTOR = 1
    const BOTTOM_CONNECTOR = 2
    const LEFT_CONNECTOR = 3
    var DARK_THEME = 1
    const CENTER_TEXT_ALIGN = 'center'
    const LEFT_TEXT_ALIGN = 'left'
    const FOR_AS_GOST_STANDART = false
    const BACKGROUND_COLOR = ['#2b2b2b', '#fff']
    const GRID_COLOR = ['#383838', '#f0f0f0']
    const MAJOR_GRID_COLOR = ['#404040', '#e0e0e0']
    const GRID_SIZE = 10
    const CANVAS_OFFSET = 58
    const MENU_FULL_MIN_SIZE = 600
    const MENU_WIDTH = {
        true: 240,
        false: 60
    }
    const MENU_X0 = 10
    const MENU_BORDER_WIDTH = 1
    const MENU_BACKGROUND_COLOR = ['#3c3f41', '#fdfdfd']
    const MENU_BORDER_COLOR = ['#8b8b8b', '#aaa']
    const MENU_BLOCK_ACTIVE_COLOR = ['#4e5254', '#2196f3']
    const MENU_TEXT_COLOR = ['#bbb', '#000']
    const MENU_ACTIVE_TEXT_COLOR = ['#fff', '#fff']
    const BLOCKS_MENU_Y0 = 10
    const BLOCKS_MENU_BLOCK_WIDTH = 40
    const BLOCKS_MENU_BLOCK_HEIGHT = 20
    const BLOCKS_MENU_DY = 20
    const BLOCKS_MENU_ITEM_PADDING = 10
    const BLOCKS_MENU_HEIGHT = BLOCK_TYPES.length * (BLOCKS_MENU_BLOCK_HEIGHT + BLOCKS_MENU_ITEM_PADDING * 2)
    const CONTROL_MENU_Y0 = -15
    const MAIN_INFO_Y0 = -10
    const MAIN_INFO_ICON_SIZE = 32
    const MAIN_INFO_TEXT_COLOR = ['#fff', '#000']
    const INFO_MENU_X0 = -10
    const INFO_MENU_Y0 = -40
    const INFO_MENU_TEXT_COLOR = ['#8b8b8b', '#000']
    const KEYBOARD_ICON_WIDTH = 40
    const KEYBOARD_ICON_HEIGHT = 40
    const KEYBOARD_MENU_X0 = -50
    const KEYBOARD_MENU_Y0 = -37
    const SHORTKEYS_BACKGROUND_COLOR = ['#383838', '#f1f7ff']
    const SHORTKEYS_BORDER_COLOR = ['#bbb', '#000']
    const SHORTKEYS_TEXT_COLOR = ['#fff', '#000']
    const SHORTKEYS_ITEMS_TEXT_COLOR = ['#bbb', '#444']
    const SHORTKEYS_WIDTH = 1000
    const SHORTKEYS_HEIGHT = 380
    const BOTTOM_MENU_X0 = -230
    const BOTTOM_MENU_Y0 = -28
    const BOTTOM_MENU_ICON_SIZE = 35
    const RIGHT_MENU_X0 = -40
    const RIGHT_MENU_ICON_SIZE = 35
    const TIPS_TEXT_COLOR = ['#fff', '#000']
    const TIPS_TIMEOUT = 3500
    const INIT_BLOCK_X0 = 10
    const SAVE_LOAD_MENU_Y0 = BLOCKS_MENU_HEIGHT
    const SAVE_LOAD_MENU_ITEM_HEIGHT = 40
    const SAVE_LOAD_MENU_HEIGHT = MENU_ITEMS.length * SAVE_LOAD_MENU_ITEM_HEIGHT
    const BLOCK_DEFAULT_STATUS = 0
    const BLOCK_SELECTED_STATUS = 1
    const BLOCK_ACTIVE_STATUS = 2
    const BLOCK_LINE_WIDTH = 2
    const BLOCK_LINE_COLOR = ['#bbb', '#000']
    const BLOCK_BACKGROUND_COLOR = ['#2a2a2a', '#fff']
    const BLOCK_POINT_COLOR = ['#888', '#888']
    const BLOCK_CONNECTOR_COLOR = ['#bbb', '#777']
    const BLOCK_POINT_BACKGROUND_COLOR = ['#fff', '#fff']
    const ACTIVE_BLOCK_COLOR = ['#4caf50', '#1f1']
    const ACTIVE_CONNECTOR_COLOR = ['#0f0', '#0f0']
    const HOVER_CONNECTOR_COLOR = ['#3e86a0', '#fff']
    const BLOCK_FONT_SIZE = 14
    const BLOCK_FONT = 'sans-serif'
    const BLOCK_TEXT_HEIGHT = 14
    const MAX_FONT_SIZE = 24
    const MIN_FONT_SIZE = 6
    const TEXT_BLOCK_ICON_FONT = (BLOCKS_MENU_BLOCK_HEIGHT + 5) + "px sans"
    const TEXT_BLOCK_ICON_COLOR = ['#bbb', '#000']
    const TEXT_BLOCK_LINE_WIDTH = 1
    const TEXT_SELECTION_COLOR = ['#bbb', '#fff']
    const TEXT_SELECTION_BACK_COLOR = ['#214283', '#3390ff']
    const DRAG_AND_DROP_BACKGROUND_COLOR = ['rgba(96, 125, 139, 0.5)', 'rgba(33, 150, 243, 0.3)']
    const DRAG_AND_DROP_TEXT_COLOR = ['#fff', '#fff']
    const DRAG_AND_DROP_FONT = '40px sans-serif'
    const SELECTION_COLOR = ['#609dab', '#609dab']
    const SELECTION_BACKGROUND_COLOR = ['rgba(160, 160, 160, 0.3)', 'rgba(160, 160, 160, 0.2)']
    const SELECTION_LINE_WIDTH = 1
    const IN_OUT_DX = 20
    const PROCEDURE_DX = 8
    const FOR_LOOP_DX = 20
    const CONNECTION_RADIUS = 3
    const MOUSE_STEP = 6
    const RESIZE_DISTANCE = 20
    const MOUSE_WHEEL_STEP = GRID_SIZE * 5
    const RESIZE_ARROW_DX = 0.5 * GRID_SIZE
    const RESIZE_ARROW_DY = 0.5 * GRID_SIZE
    const RESIZE_ARROW_LINE_WIDTH = 2
    const POSITION_LINE_COLOR = ['#0a0', '#0a0']
    const POSITION_LINE_WIDTH = 1
    const POSITION_LINE_DASH = [GRID_SIZE / 2, GRID_SIZE / 2]
    const SCALE_TRANSITION_ITERATIONS = 15
    const SCALE_TRANSITION_PERIOD = 10
    const ARROW_COLOR = ['#a9b7c6', '#000']
    const ARROW_ACTIVE_COLOR = ['#4caf50', '#1f1']
    const ARROW_WIDTH = 1
    const ARROW_DY = 7
    const ARROW_DX = 2
    const ARROW_MOUSE_DISTANCE = 5
    const ARROW_NODE_RADIUS = 3
    const ARROW_SEGMENT_RADIUS = 6
    const ADD_NODE_AS_POINT = false
    const SAVE_WITH_BACKGROUND = true
    let REPLACE_MATH_RULES = [
        ["\\all", "∀ "],
        ["\\forall", "∀ "],
        ["\\exist", "∃ "],
        ["\\notexist", "∄ "],
        ["\\isin", "∈ "],
        ["\\notin", "∉ "],
        ["<=>", "⇔ "],
        ["=>", "⇒"],
        ["<->", "↔ "],
        ["->", "→ "],
        ["<-", "← "],
        ["/\\", "∧ "],
        ["&&", "∧ "],
        ["\\/", "∨ "],
        ["||", "∨ "],
        ["\\*", "⋅"],
        [">=", "≥ "],
        ["<=", "≤ "],
        ["!=", "≠ "],
        ["\\<", "≺"],
        ["\\>", "≻"],
        ["^0", "⁰"],
        ["^1", "¹"],
        ["^2", "²"],
        ["^3", "³"],
        ["^4", "⁴"],
        ["^5", "⁵"],
        ["^6", "⁶"],
        ["^7", "⁷"],
        ["^8", "⁸"],
        ["^9", "⁹"],
        ["_x", "ₓ"],
        ["_0", "₀"],
        ["_1", "₁"],
        ["_2", "₂"],
        ["_3", "₃"],
        ["_4", "₄"],
        ["_5", "₅"],
        ["_6", "₆"],
        ["_7", "₇"],
        ["_8", "₈"],
        ["_9", "₉"],
        ['\\alpha', 'α'],
        ['\\beta', 'β'],
        ['\\gamma', 'γ'],
        ['\\delta', 'δ'],
        ['\\epsilon', 'ε'],
        ['\\zeta', 'ζ'],
        ['\\eta', 'η'],
        ['\\theta', 'θ'],
        ['\\iota', 'ι'],
        ['\\kappa', 'κ'],
        ['\\lambda', 'λ'],
        ['\\mu', 'μ'],
        ['\\nu', 'ν'],
        ['\\ksi', 'ξ'],
        ['\\omicron', 'ο'],
        ['\\pi', 'π'],
        ['\\rho', 'ρ'],
        ['\\sigma', 'σ'],
        ['\\tau', 'τ'],
        ['\\upsilon', 'υ'],
        ['\\hi', 'χ'],
        ['\\phi', 'φ'],
        ['\\psi', 'ψ'],
        ['\\omega', 'ω'],
        ['\\Alpha', 'Α'],
        ['\\Beta', 'Β'],
        ['\\Gamma', 'Γ'],
        ['\\Delta', 'Δ'],
        ['\\Epsilon', 'Ε'],
        ['\\Zeta', 'Ζ'],
        ['\\Eta', 'Η'],
        ['\\Theta', 'Θ'],
        ['\\Iota', 'Ι'],
        ['\\Kappa', 'Κ'],
        ['\\Lambda', 'Λ'],
        ['\\Mu', 'Μ'],
        ['\\Nu', 'Ν'],
        ['\\Ksi', 'Ξ'],
        ['\\Omicron', 'Ο'],
        ['\\Pi', 'Π'],
        ['\\Rho', 'Ρ'],
        ['\\Sigma', 'Σ'],
        ['\\Tau', 'Τ'],
        ['\\Upsilon', 'Υ'],
        ['\\Hi', 'Χ'],
        ['\\Phi', 'Φ'],
        ['\\Psi', 'Ψ'],
        ['\\Omega', 'Ω']
    ]
    
    function Connector(block, dx, dy) {
        this.block = block
        this.dx = dx
        this.dy = dy
        this.Update()
    }
    Connector.prototype.Draw = function(ctx, x0, y0, scale, isActive = true) {
        let x = this.posX * scale + x0
        let y = this.posY * scale + y0
        ctx.lineWidth = BLOCK_LINE_WIDTH
        ctx.fillStyle = BLOCK_CONNECTOR_COLOR[DARK_THEME]
        ctx.beginPath()
        ctx.arc(x, y, CONNECTION_RADIUS * scale, 0, 2 * Math.PI)
        ctx.fill()
        ctx.strokeStyle = isActive ? ACTIVE_CONNECTOR_COLOR[DARK_THEME] : HOVER_CONNECTOR_COLOR[DARK_THEME]
        ctx.beginPath()
        ctx.arc(x, y, (CONNECTION_RADIUS + 2) * scale, 0, 2 * Math.PI)
        ctx.stroke()
    }
    Connector.prototype.GetDistance = function(x, y) {
        let dx = x - this.posX
        let dy = y - this.posY
        return dx * dx + dy * dy
    }
    Connector.prototype.IsMouseHover = function(x, y) {
        return this.GetDistance(x, y) < MOUSE_STEP * MOUSE_STEP
    }
    Connector.prototype.Update = function() {
        this.x = this.block.width * this.dx
        this.y = this.block.height * this.dy
        this.posX = this.block.x + this.x + Math.sign(this.dx) * GRID_SIZE
        this.posY = this.block.y + this.y + Math.sign(this.dy) * GRID_SIZE
    }
    
    function Block(x, y, text, width, height, type = BLOCK_TYPE, isMenuBlock = false) {
        this.x = x
        this.y = y
        this.field = new TextField(text == '' && !isMenuBlock ? this.GetDefaultText(type) : text)
        if (width < RESIZE_DISTANCE || height < RESIZE_DISTANCE) throw "invalid block size"
        this.width = width
        this.height = height
        if (ALL_BLOCK_TYPES.indexOf(type) == -1) throw "invalid block type"
        this.type = type
        this.isMenuBlock = isMenuBlock
        this.fontSize = BLOCK_FONT_SIZE
        this.textHeight = BLOCK_TEXT_HEIGHT
        this.isBold = false
        this.isItalic = false
        this.textAlign = CENTER_TEXT_ALIGN
        if (type == TEXT_TYPE) this.textAlign = LEFT_TEXT_ALIGN
        this.labelsPosition = isMenuBlock ? 0 : 1
        this.FixPositionByGrid()
        this.InitResizePoints()
        this.InitConnectors()
        this.FixHeightByText()
    }
    Block.prototype.GetDefaultText = function(type) {
        if (type == BEGIN_END_TYPE) return 'начало'
        if (type == IN_OUT_TYPE || type == DISPLAY_TYPE) return 'вывод'
        if (type == FOR_LOOP_TYPE || type == FOR_LOOP_BEGIN_TYPE) return 'i от 1 до n'
        if (type == LABEL_TYPE) return '1'
        if (type == TEXT_TYPE) return 'change text'
        return ''
    }
    Block.prototype.FixPoints = function() {
        this.InitBorders()
        this.InitResizePoints()
        this.UpdateConnectors()
    }
    Block.prototype.FixHeightByText = function() {
        let totalHeight = this.field.texts.length * this.textHeight
        if (totalHeight > this.height || this.type == TEXT_TYPE) {
            let newHeight = Math.floor((totalHeight + GRID_SIZE * 2 - 1) / GRID_SIZE / 2) * GRID_SIZE * 2
            this.y += (newHeight - this.height) / 2
            this.height = newHeight
        }
        this.FixPoints()
    }
    Block.prototype.GetTextOffset = function() {
        if (this.type == PROCEDURE_TYPE) return PROCEDURE_DX
        if (this.type == FOR_LOOP_TYPE || this.type == FOR_LOOP_BEGIN_TYPE || this.type == FOR_LOOP_END_TYPE) return FOR_LOOP_DX / 2
        if (this.type == CONDITION_TYPE) return GRID_SIZE
        if (this.type == IN_OUT_TYPE) return IN_OUT_DX / 2
        return 0
    }
    Block.prototype.GetMaxWidth = function(ctx) {
        let maxWidth = RESIZE_DISTANCE
        for (let i = 0; i < this.field.texts.length; i++) maxWidth = Math.max(maxWidth, ctx.measureText(this.field.texts[i]).width)
        if (this.textAlign == LEFT_TEXT_ALIGN) maxWidth += GRID_SIZE
        return maxWidth + this.GetTextOffset() * 2
    }
    Block.prototype.FixWidthByText = function(ctx) {
        ctx.font = this.GetFormatting() + (this.fontSize) + 'px ' + BLOCK_FONT
        let maxWidth = this.GetMaxWidth(ctx)
        let currWidth = this.width
        this.width = Math.floor(maxWidth / GRID_SIZE + 1) * GRID_SIZE
        if (this.textAlign == LEFT_TEXT_ALIGN) this.x += (this.width - currWidth) / 2
        this.FixPoints()
    }
    Block.prototype.FixSizesByText = function(ctx) {
        ctx.font = this.GetFormatting() + (this.fontSize) + 'px ' + BLOCK_FONT
        this.FixHeightByText()
        if (this.type == TEXT_TYPE) this.FixWidthByText(ctx)
    }
    Block.prototype.InitBorders = function() {
        this.left = this.x - this.width / 2
        this.right = this.x + this.width / 2
        this.top = this.y - this.height / 2
        this.bottom = this.y + this.height / 2
    }
    Block.prototype.FixPositionByGrid = function() {
        this.x = Math.floor((this.x + GRID_SIZE - 1) / GRID_SIZE) * GRID_SIZE
        this.y = Math.floor((this.y + GRID_SIZE - 1) / GRID_SIZE) * GRID_SIZE
        this.height = Math.floor((this.height + GRID_SIZE - 1) / GRID_SIZE) * GRID_SIZE
        this.width = Math.floor((this.width + GRID_SIZE - 1) / GRID_SIZE) * GRID_SIZE
        this.InitBorders()
    }
    Block.prototype.InitResizePoints = function() {
        this.resizePoints = []
        if (this.type == TEXT_TYPE) return
        if (this.type != LABEL_TYPE) {
            this.resizePoints.push({
                x: 0,
                y: -this.height / 2
            })
            this.resizePoints.push({
                x: this.width / 2,
                y: -this.height / 2
            })
            this.resizePoints.push({
                x: this.width / 2,
                y: 0
            })
            this.resizePoints.push({
                x: this.width / 2,
                y: this.height / 2
            })
            this.resizePoints.push({
                x: 0,
                y: this.height / 2
            })
            this.resizePoints.push({
                x: -this.width / 2,
                y: this.height / 2
            })
            this.resizePoints.push({
                x: -this.width / 2,
                y: 0
            })
            this.resizePoints.push({
                x: -this.width / 2,
                y: -this.height / 2
            })
        } else {
            this.resizePoints.push({
                x: this.width / 2,
                y: -this.height / 2
            })
            this.resizePoints.push({
                x: this.width / 2,
                y: this.height / 2
            })
            this.resizePoints.push({
                x: -this.width / 2,
                y: this.height / 2
            })
            this.resizePoints.push({
                x: -this.width / 2,
                y: -this.height / 2
            })
        }
    }
    Block.prototype.InitConnectors = function() {
        this.connectors = []
        // this.connectors[TOP_CONNECTOR] = new Connector(this, 0, -0.5)
        // this.connectors[RIGHT_CONNECTOR] = new Connector(this, 0.5, 0)
        // this.connectors[BOTTOM_CONNECTOR] = new Connector(this, 0, 0.5)
        // this.connectors[LEFT_CONNECTOR] = new Connector(this, -0.5, 0)
    }
    Block.prototype.UpdateConnectors = function() {
        for (let i = 0; i < this.connectors.length; i++) this.connectors[i].Update()
    }
    Block.prototype.GetFormatting = function() {
        let bold = this.isBold ? 'bold ' : ''
        let italic = this.isItalic ? 'italic ' : ''
        return bold + italic
    }
    Block.prototype.GetFontInfo = function() {
        let info = []
        if (this.isBold) info.push('жирный')
        if (this.isItalic) info.push('курсивный')
        if (info.length == 0) info.push('обычный')
        return info.join(", ")
    }
    Block.prototype.DrawBlock = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.rect(this.left * scale + x0, this.top * scale + y0, this.width * scale, this.height * scale)
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawCondition = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.moveTo(this.x * scale + x0, (this.top - this.height) * scale + y0)
        ctx.lineTo((this.x + this.height) * scale + x0, (this.top - this.height) * scale + y0)
        ctx.lineTo((this.x + this.height + 20) * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, (this.bottom) * scale + y0)
        ctx.lineTo(this.left * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.x - 20)  * scale + x0, this.top * scale + y0)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawBeginEnd = function(ctx, x0, y0, scale) {
        let radius = this.width > this.height ? this.height / 2 : 2 * GRID_SIZE
        ctx.beginPath()
        ctx.moveTo((this.left + radius) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - radius) * scale + x0, this.top * scale + y0)
        if (this.width > this.height) {
            ctx.arc((this.right - radius) * scale + x0, this.y * scale + y0, radius * scale, -Math.PI / 2, Math.PI / 2)
        } else {
            let alpha = Math.atan2(radius, this.height / 2)
            let r = this.height / 2 / Math.sin(Math.PI - alpha * 2)
            ctx.arc((this.right - r) * scale + x0, this.y * scale + y0, r * scale, -alpha * 2, alpha * 2)
        }
        ctx.lineTo((this.right - radius) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo((this.left + radius) * scale + x0, this.bottom * scale + y0)
        if (this.width > this.height) {
            ctx.arc((this.left + radius) * scale + x0, this.y * scale + y0, radius * scale, Math.PI / 2, -Math.PI / 2)
        } else {
            let alpha = Math.atan2(radius, this.height / 2)
            let r = this.height / 2 / Math.sin(Math.PI - alpha * 2)
            ctx.arc((this.left + r) * scale + x0, this.y * scale + y0, r * scale, Math.PI - alpha * 2, Math.PI + alpha * 2)
        }
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawProcedure = function(ctx, x0, y0, scale) {
        this.DrawBlock(ctx, x0, y0, scale)
        dx = this.isMenuBlock ? 5 : PROCEDURE_DX
        ctx.lineWidth = Math.max(1, BLOCK_LINE_WIDTH - 1)
        if (scale > 1) ctx.lineWidth *= scale
        ctx.beginPath()
        ctx.moveTo((this.right - dx) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - dx) * scale + x0, this.bottom * scale + y0)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo((this.left + dx) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.left + dx) * scale + x0, this.bottom * scale + y0)
        ctx.stroke()
    }
    Block.prototype.DrawInOut = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.moveTo((this.left + IN_OUT_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right + IN_OUT_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - IN_OUT_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo((this.left - IN_OUT_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawForLoop = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.moveTo((this.left + FOR_LOOP_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - FOR_LOOP_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, this.y * scale + y0)
        ctx.lineTo((this.right - FOR_LOOP_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo((this.left + FOR_LOOP_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, this.y * scale + y0)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawForLoopBegin = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.moveTo((this.left + FOR_LOOP_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - FOR_LOOP_DX / 2) * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, (this.top + FOR_LOOP_DX) * scale + y0)
        ctx.lineTo(this.right * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, (this.top + FOR_LOOP_DX) * scale + y0)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawForLoopEnd = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.moveTo(this.left * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, this.top * scale + y0)
        ctx.lineTo(this.right * scale + x0, (this.bottom - FOR_LOOP_DX) * scale + y0)
        ctx.lineTo((this.right - FOR_LOOP_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo((this.left + FOR_LOOP_DX / 2) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, (this.bottom - FOR_LOOP_DX) * scale + y0)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawLabel = function(ctx, x0, y0, scale) {
        ctx.beginPath()
        ctx.arc(this.x * scale + x0, this.y * scale + y0, this.height / 2 * scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawTextBlock = function(ctx, x0, y0, scale, status) {
        if (this.isMenuBlock) {
            ctx.font = TEXT_BLOCK_ICON_FONT
            ctx.fillStyle = TEXT_BLOCK_ICON_COLOR[DARK_THEME]
            ctx.textAlign = 'center'
            ctx.fillText('T', this.x * scale + x0, this.y * scale + y0)
        } else if (status > BLOCK_DEFAULT_STATUS) {
            ctx.strokeStyle = status == BLOCK_ACTIVE_STATUS ? ACTIVE_BLOCK_COLOR[DARK_THEME] : BLOCK_LINE_COLOR[DARK_THEME]
            ctx.lineWidth = TEXT_BLOCK_LINE_WIDTH
            if (scale > 1) ctx.lineWidth *= scale
            ctx.beginPath()
            ctx.rect(this.left * scale + x0, this.top * scale + y0, this.width * scale, this.height * scale)
            ctx.stroke()
        }
    }
    Block.prototype.DrawCommentLine = function(ctx, x0, y0, scale, connector) {
        ctx.strokeStyle = BLOCK_LINE_COLOR[DARK_THEME]
        ctx.lineWidth = TEXT_BLOCK_LINE_WIDTH
        if (scale > 1) ctx.lineWidth *= scale
        if (connector == this.connectors[LEFT_CONNECTOR]) {
            ctx.beginPath()
            ctx.moveTo((this.left + GRID_SIZE) * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.left * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.left * scale + x0, this.bottom * scale + y0)
            ctx.lineTo((this.left + GRID_SIZE) * scale + x0, this.bottom * scale + y0)
            ctx.stroke()
        } else if (connector == this.connectors[RIGHT_CONNECTOR]) {
            ctx.beginPath()
            ctx.moveTo((this.right - GRID_SIZE) * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.right * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.right * scale + x0, this.bottom * scale + y0)
            ctx.lineTo((this.right - GRID_SIZE) * scale + x0, this.bottom * scale + y0)
            ctx.stroke()
        } else if (connector == this.connectors[TOP_CONNECTOR]) {
            ctx.beginPath()
            ctx.moveTo(this.left * scale + x0, (this.top + GRID_SIZE) * scale + y0)
            ctx.lineTo(this.left * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.right * scale + x0, this.top * scale + y0)
            ctx.lineTo(this.right * scale + x0, (this.top + GRID_SIZE) * scale + y0)
            ctx.stroke()
        } else if (connector == this.connectors[BOTTOM_CONNECTOR]) {
            ctx.beginPath()
            ctx.moveTo(this.left * scale + x0, (this.bottom - GRID_SIZE) * scale + y0)
            ctx.lineTo(this.left * scale + x0, this.bottom * scale + y0)
            ctx.lineTo(this.right * scale + x0, this.bottom * scale + y0)
            ctx.lineTo(this.right * scale + x0, (this.bottom - GRID_SIZE) * scale + y0)
            ctx.stroke()
        }
    }
    Block.prototype.DrawDisplay = function(ctx, x0, y0, scale) {
        let radius = this.width > this.height ? this.height / 2 : 2 * GRID_SIZE
        ctx.beginPath()
        ctx.moveTo((this.left + radius) * scale + x0, this.top * scale + y0)
        ctx.lineTo((this.right - radius) * scale + x0, this.top * scale + y0)
        if (this.width > this.height) {
            ctx.arc((this.right - radius) * scale + x0, this.y * scale + y0, radius * scale, -Math.PI / 2, Math.PI / 2)
        } else {
            let alpha = Math.atan2(radius, this.height / 2)
            let r = this.height / 2 / Math.sin(Math.PI - alpha * 2)
            ctx.arc((this.right - r) * scale + x0, this.y * scale + y0, r * scale, -alpha * 2, alpha * 2)
        }
        ctx.lineTo((this.right - radius) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo((this.left + radius) * scale + x0, this.bottom * scale + y0)
        ctx.lineTo(this.left * scale + x0, this.y * scale + y0)
        ctx.lineTo((this.left + radius) * scale + x0, this.top * scale + y0)
        ctx.stroke()
        ctx.fill()
    }
    Block.prototype.DrawLabelText = function(ctx, text, x, y, align) {
        ctx.fillStyle = BLOCK_LINE_COLOR[DARK_THEME]
        ctx.textAlign = align
        ctx.fillText(text, x, y)
    }
    Block.prototype.GetHorizontalCursorPosition = function(index, offset, ctx, x0, scale) {
        let width = ctx.measureText(this.field.texts[index].substr(0, offset)).width
        if (this.textAlign == LEFT_TEXT_ALIGN) return (this.left + this.GetTextOffset() + GRID_SIZE / 2) * scale + width + x0
        let allWidth = ctx.measureText(this.field.texts[index]).width
        return this.x * scale - allWidth / 2 + width + x0
    }
    Block.prototype.GetVerticalCursorPosition = function(index, y0, scale) {
        return (this.y + (index + 0.5 - this.field.texts.length / 2) * this.textHeight) * scale + y0
    }
    Block.prototype.DrawCursor = function(ctx, x0, y0, scale) {
        let x = this.GetHorizontalCursorPosition(this.field.index, this.field.offset, ctx, x0, scale)
        let y = this.GetVerticalCursorPosition(this.field.index, y0, scale)
        ctx.lineWidth = Math.max(1, scale / 2)
        ctx.strokeStyle = BLOCK_LINE_COLOR[DARK_THEME]
        ctx.beginPath()
        ctx.moveTo(x, y - this.textHeight * 0.6 * scale)
        ctx.lineTo(x, y + this.textHeight * 0.6 * scale)
        ctx.stroke()
    }
    Block.prototype.DrawSelection = function(ctx, x0, y0, scale) {
        let startIndex = this.field.selectionStartIndex
        let startOffset = this.field.selectionStartOffset
        let endIndex = this.field.selectionEndIndex
        let endOffset = this.field.selectionEndOffset
        if (startIndex == -1 || endIndex == -1) return
        if (endIndex < startIndex) {
            startIndex = this.field.selectionEndIndex
            startOffset = this.field.selectionEndOffset
            endIndex = this.field.selectionStartIndex
            endOffset = this.field.selectionStartOffset
        } else if (startIndex == endIndex && startOffset > endOffset) {
            startOffset = this.field.selectionEndOffset
            endOffset = this.field.selectionStartOffset
        }
        for (let index = startIndex; index <= endIndex; index++) {
            let y = this.GetVerticalCursorPosition(index, y0, scale)
            let offsetLeft = index == startIndex ? startOffset : 0
            let offsetRight = index == endIndex ? endOffset : this.field.texts[index].length
            let x1 = this.GetHorizontalCursorPosition(index, offsetLeft, ctx, x0, scale)
            let x2 = this.GetHorizontalCursorPosition(index, offsetRight, ctx, x0, scale)
            if (index < endIndex) x2 += 2 * scale
            ctx.fillStyle = TEXT_SELECTION_BACK_COLOR[DARK_THEME]
            ctx.fillRect(x1, y - this.textHeight / 2 * scale, x2 - x1, this.textHeight * scale)
            ctx.fillStyle = TEXT_SELECTION_COLOR[DARK_THEME]
            ctx.textAlign = 'left'
            ctx.fillText(this.field.texts[index].substr(offsetLeft, offsetRight - offsetLeft), x1, y)
        }
    }
    Block.prototype.DrawLabels = function(ctx, x0, y0, scale) {
        ctx.font = (BLOCK_FONT_SIZE * scale) + 'px ' + BLOCK_FONT
        if (this.labelsPosition == 3) {
            this.DrawLabelText(ctx, 'да', (this.right + 5) * scale + x0, (this.y - BLOCK_TEXT_HEIGHT) * scale + y0, 'right')
            this.DrawLabelText(ctx, 'нет', (this.x + 5) * scale + x0, (this.bottom + BLOCK_TEXT_HEIGHT) * scale + y0, 'left')
            return
        }
        if (this.labelsPosition == 4) {
            this.DrawLabelText(ctx, 'нет', (this.right + 5) * scale + x0, (this.y - BLOCK_TEXT_HEIGHT) * scale + y0, 'right')
            this.DrawLabelText(ctx, 'да', (this.x + 5) * scale + x0, (this.bottom + BLOCK_TEXT_HEIGHT) * scale + y0, 'left')
            return
        }
        this.DrawLabelText(ctx, this.labelsPosition == 2 ? 'да' : 'нет', (this.left - 5) * scale + x0, (this.y - BLOCK_TEXT_HEIGHT) * scale + y0, 'left')
        this.DrawLabelText(ctx, this.labelsPosition == 2 ? 'нет' : 'да', (this.right + 5) * scale + x0, (this.y - BLOCK_TEXT_HEIGHT) * scale + y0, 'right')
    }
    Block.prototype.DrawText = function(ctx, x0, y0, scale) {
        ctx.fillStyle = BLOCK_LINE_COLOR[DARK_THEME]
        ctx.textAlign = this.textAlign
        ctx.textBaseline = 'middle'
        ctx.font = this.GetFormatting() + (this.fontSize * scale) + 'px ' + BLOCK_FONT
        let totalHeight = this.field.texts.length * this.textHeight
        let dy = (this.height - totalHeight) / 2
        let x = this.textAlign == CENTER_TEXT_ALIGN ? this.x : this.left + this.GetTextOffset() + GRID_SIZE / 2
        for (let i = 0; i < this.field.texts.length; i++) ctx.fillText(this.field.texts[i], x * scale + x0, (this.top + dy + (i + 0.5) * this.textHeight) * scale + y0)
        if (this.field.isEdit) {
            this.DrawSelection(ctx, x0, y0, scale)
            this.DrawCursor(ctx, x0, y0, scale)
        }
        if (this.type == CONDITION_TYPE && this.labelsPosition != 0) {
            this.DrawLabels(ctx, x0, y0, scale)
        }
    }
    Block.prototype.DrawResizePoint = function(ctx, x0, y0, scale, point) {
        let x = (this.x + point.x) * scale + x0
        let y = (this.y + point.y) * scale + y0
        let radius = scale == 1 ? CONNECTION_RADIUS : Math.floor(CONNECTION_RADIUS * scale / 1.5)
        ctx.lineWidth = BLOCK_LINE_WIDTH
        ctx.strokeStyle = BLOCK_POINT_COLOR[DARK_THEME]
        ctx.fillStyle = BLOCK_POINT_BACKGROUND_COLOR[DARK_THEME]
        ctx.beginPath()
        ctx.rect(x - radius, y - radius, 2 * radius, 2 * radius)
        ctx.fill()
        ctx.stroke()
    }
    Block.prototype.DrawConnectors = function(ctx, x0, y0, scale) {
        for (let i = 0; i < this.connectors.length; i++) this.connectors[i].Draw(ctx, x0, y0, scale, false)
    }
    Block.prototype.DrawResizePoints = function(ctx, x0, y0, scale) {
        for (let i = 0; i < this.resizePoints.length; i++) this.DrawResizePoint(ctx, x0, y0, scale, this.resizePoints[i])
    }
    Block.prototype.Draw = function(ctx, x0, y0, scale, status = BLOCK_DEFAULT_STATUS, withBackground = true) {
        ctx.strokeStyle = status > BLOCK_SELECTED_STATUS ? ACTIVE_BLOCK_COLOR[DARK_THEME] : BLOCK_LINE_COLOR[DARK_THEME]
        ctx.lineWidth = status > BLOCK_DEFAULT_STATUS ? BLOCK_LINE_WIDTH + 1 : BLOCK_LINE_WIDTH
        ctx.fillStyle = withBackground ? BLOCK_BACKGROUND_COLOR[DARK_THEME] : 'rgba(0, 0, 0, 0)'
        if (scale > 1) ctx.lineWidth *= scale
        if (this.type == BLOCK_TYPE) {
            this.DrawBlock(ctx, x0, y0, scale)
        } else if (this.type == CONDITION_TYPE) {
            this.DrawCondition(ctx, x0, y0, scale)
        } else if (this.type == BEGIN_END_TYPE) {
            this.DrawBeginEnd(ctx, x0, y0, scale)
        } else if (this.type == PROCEDURE_TYPE) {
            this.DrawProcedure(ctx, x0, y0, scale)
        } else if (this.type == IN_OUT_TYPE) {
            this.DrawInOut(ctx, x0, y0, scale)
        } else if (this.type == FOR_LOOP_TYPE) {
            this.DrawForLoop(ctx, x0, y0, scale)
        } else if (this.type == FOR_LOOP_BEGIN_TYPE) {
            this.DrawForLoopBegin(ctx, x0, y0, scale)
        } else if (this.type == FOR_LOOP_END_TYPE) {
            this.DrawForLoopEnd(ctx, x0, y0, scale)
        } else if (this.type == LABEL_TYPE) {
            this.DrawLabel(ctx, x0, y0, scale)
        } else if (this.type == TEXT_TYPE) {
            this.DrawTextBlock(ctx, x0, y0, scale, status)
        } else if (this.type == DISPLAY_TYPE) {
            this.DrawDisplay(ctx, x0, y0, scale)
        }
        this.DrawText(ctx, x0, y0, scale)
    }
    Block.prototype.IsMouseHover = function(x, y) {
        if (x < this.left || x > this.right) return false
        if (y < this.top || y > this.bottom) return false
        if (this.type == BLOCK_TYPE || this.type == PROCEDURE_TYPE || this.type == IN_OUT_TYPE || this.type == FOR_LOOP_TYPE || this.type == FOR_LOOP_BEGIN_TYPE || this.type == FOR_LOOP_END_TYPE || this.type == DISPLAY_TYPE || this.type == TEXT_TYPE) return true
        if (this.type == BEGIN_END_TYPE) {
            if (x >= this.left + this.height / 2 && x <= this.right - this.height / 2) return true
            let dx1 = x - (this.left + this.height / 2)
            let dx2 = x - (this.right - this.height / 2)
            let dy = y - this.y
            if (dx1 * dx1 + dy * dy < this.height * this.height / 4) return true
            if (dx2 * dx2 + dy * dy < this.height * this.height / 4) return true
            return false
        }
        if (this.type == CONDITION_TYPE) {
            let k = this.height / this.width
            let dx = x - this.x
            let dy = this.y - y
            if (dx > 0) {
                return dy < -k * dx + this.height / 2 && dy > k * dx - this.height / 2
            } else {
                return dy < k * dx + this.height / 2 && dy > -k * dx - this.height / 2
            }
        }
        if (this.type == LABEL_TYPE) {
            let dx = x - this.x
            let dy = y - this.y
            return dx * dx + dy * dy < this.height * this.height / 4
        }
        return false
    }
    Block.prototype.IsIntersectLine = function(p1, p2) {
        let dx = p2.x - p1.x
        let dy = p2.y - p1.y
        let left = this.left - (this.type == IN_OUT_TYPE ? IN_OUT_DX : 0)
        let right = this.right + (this.type == IN_OUT_TYPE ? IN_OUT_DX : 0)
        if (dx == 0) {
            if (p1.x < left + CONNECTION_RADIUS - GRID_SIZE || p1.x > right - CONNECTION_RADIUS + GRID_SIZE) return false
            if (p1.y > this.top + CONNECTION_RADIUS && p1.y < this.bottom - CONNECTION_RADIUS) return true
            if (p2.y > this.top + CONNECTION_RADIUS && p2.y < this.bottom - CONNECTION_RADIUS) return true
            return Math.min(p1.y, p2.y) <= this.top + CONNECTION_RADIUS && Math.max(p1.y, p2.y) >= this.bottom - CONNECTION_RADIUS
        } else {
            if (p1.y < this.top + CONNECTION_RADIUS - GRID_SIZE || p1.y > this.bottom - CONNECTION_RADIUS + GRID_SIZE) return false
            if (p1.x > this.left + CONNECTION_RADIUS && p1.x < this.right - CONNECTION_RADIUS) return true
            if (p2.x > this.left + CONNECTION_RADIUS && p2.x < this.right - CONNECTION_RADIUS) return true
            return Math.min(p1.x, p2.x) <= this.left && Math.max(p1.x, p2.x) >= this.right
        }
    }
    Block.prototype.IsEqual = function(block) {
        if (this.x != block.x || this.y != block.y) return false
        if (this.field.text != block.field.text || this.type != block.type) return false
        if (this.width != block.width || this.height != block.height) return false
        if (this.isMenuBlock != block.isMenuBlock) return false
        return true
    }
    Block.prototype.IsBreak = function() {
        return this.type == BLOCK_TYPE && this.field.text == 'break'
    }
    Block.prototype.IsContinue = function() {
        return this.type == BLOCK_TYPE && this.field.text == 'continue'
    }
    Block.prototype.IsText = function() {
        return this.type == TEXT_TYPE
    }
    Block.prototype.GetConnector = function(x, y) {
        for (let i = 0; i < this.connectors.length; i++)
            if (this.connectors[i].IsMouseHover(x, y)) return this.connectors[i]
        return null
    }
    Block.prototype.GetNearsetConnector = function(x, y) {
        let imin = -1
        let minDst = -1
        for (let i = 0; i < this.connectors.length; i++) {
            let dst = this.connectors[i].GetDistance(x, y)
            if (imin == -1 || dst < minDst) {
                imin = i
                minDst = dst
            }
        }
        return this.connectors[imin]
    }
    Block.prototype.GetResizePoint = function(x, y) {
        for (let i = 0; i < this.resizePoints.length; i++) {
            let dx = x - this.x - this.resizePoints[i].x
            let dy = y - this.y - this.resizePoints[i].y
            if (dx * dx + dy * dy < MOUSE_STEP * MOUSE_STEP) return this.resizePoints[i]
        }
        return null
    }
    Block.prototype.Move = function(dx, dy) {
        this.x += dx
        this.y += dy
        this.UpdateConnectors()
        this.InitBorders()
    }
    Block.prototype.CanResizeHorizontally = function(dx, dirX) {
        return this.width + dx * dirX > RESIZE_DISTANCE
    }
    Block.prototype.CanResizeVertically = function(dy, dirY) {
        return this.height + dy * dirY > RESIZE_DISTANCE
    }
    Block.prototype.CanResize = function(dx, dy, dirX, dirY) {
        return this.CanResizeHorizontally(dx, dirX) && this.CanResizeVertically(dy, dirY)
    }
    Block.prototype.Resize = function(dx, dy, dirX, dirY) {
        this.x += dx / 2 * Math.abs(dirX)
        this.y += dy / 2 * Math.abs(dirY)
        this.width += dx * dirX
        this.height += dy * dirY
        if (this.width < RESIZE_DISTANCE) this.width = RESIZE_DISTANCE
        if (this.height < RESIZE_DISTANCE) this.height = RESIZE_DISTANCE
        if (this.type == LABEL_TYPE) this.width = this.height
        this.InitResizePoints()
        this.UpdateConnectors()
        this.InitBorders()
    }
    Block.prototype.Copy = function(x = null, y = null) {
        let block = new Block(x == null ? this.x : x, y == null ? this.y : y, this.field.text, this.width, this.height, this.type, this.isMenuBlock)
        block.fontSize = this.fontSize
        block.isBold = this.isBold
        block.isItalic = this.isItalic
        block.textAlign = this.textAlign
        block.labelsPosition = this.labelsPosition
        return block
    }
    Block.prototype.StartEdit = function() {
        this.field.StartEdit()
    }
    Block.prototype.EndEdit = function() {
        this.field.EndEdit()
    }
    Block.prototype.GetText = function() {
        return this.field.text
    }
    Block.prototype.GetSelectedText = function() {
        return this.field.GetSelectedText()
    }
    Block.prototype.SetText = function(text) {
        this.field.Init(text)
    }
    Block.prototype.RemoveText = function(key, ctrlKey, shiftKey, ctx) {
        this.field.RemoveText(key, ctrlKey, shiftKey)
        this.FixSizesByText(ctx)
    }
    Block.prototype.InsertText = function(text, ctx) {
        this.field.InsertText(text)
        this.FixSizesByText(ctx)
    }
    Block.prototype.ChangeType = function(type) {
        if (this.type == type) return
        if (this.type == BEGIN_END_TYPE) {
            this.height += GRID_SIZE
        } else if (type == BEGIN_END_TYPE) {
            this.height -= GRID_SIZE
        }
        this.type = type
        this.FixPoints()
    }
    Block.prototype.CanSwapLabelsOrText = function() {
        return this.type == CONDITION_TYPE || this.type == BEGIN_END_TYPE || this.type == IN_OUT_TYPE || this.type == LABEL_TYPE || this.type == FOR_LOOP_TYPE || this.type == FOR_LOOP_BEGIN_TYPE || this.type == FOR_LOOP_END_TYPE
    }
    Block.prototype.SwapLabelsOfText = function(ctrlKey) {
        if (this.type == CONDITION_TYPE) {
            this.labelsPosition = (this.labelsPosition + (ctrlKey ? -1 : 1) + 5) % 5
        } else if (this.type == BEGIN_END_TYPE) {
            this.field.SwapTexts(['', 'вернуть ', 'начало', 'конец'], ['начало', 'начало', 'конец', 'вернуть '])
        } else if (this.type == IN_OUT_TYPE) {
            this.field.SwapTexts(['', 'ввод', 'вывод'], ['вывод', 'вывод', 'ввод'])
        } else if (this.type == LABEL_TYPE) {
            let label = +this.field.text
            if (Number.isInteger(label)) this.field.Init(Math.max(1, label + (ctrlKey ? -1 : 1)) + "")
        } else if (this.type == FOR_LOOP_TYPE) {
            this.type = ctrlKey ? FOR_LOOP_END_TYPE : FOR_LOOP_BEGIN_TYPE
        } else if (this.type == FOR_LOOP_BEGIN_TYPE) {
            this.type = ctrlKey ? FOR_LOOP_TYPE : FOR_LOOP_END_TYPE
        } else if (this.type == FOR_LOOP_END_TYPE) {
            this.type = ctrlKey ? FOR_LOOP_BEGIN_TYPE : FOR_LOOP_TYPE
        }
    }
    Block.prototype.GetCursorPositionByPoint = function(x, y, ctx) {
        ctx.font = this.GetFormatting() + (this.fontSize) + 'px ' + BLOCK_FONT
        let index = Math.floor((y - this.y + this.field.texts.length * this.textHeight / 2) / this.textHeight)
        index = Math.max(0, Math.min(this.field.texts.length - 1, index))
        let fullWidth = ctx.measureText(this.field.texts[index]).width
        let left = this.textAlign == CENTER_TEXT_ALIGN ? this.x - fullWidth / 2 : this.left + this.GetTextOffset() + GRID_SIZE / 2
        let right = this.textAlign == CENTER_TEXT_ALIGN ? this.x + fullWidth / 2 : this.left + this.GetTextOffset() + GRID_SIZE / 2 + fullWidth
        if (x < left) return {
            index: index,
            offset: 0
        }
        if (x > right) return {
            index: index,
            offset: this.field.texts[index].length
        }
        let offset = 0
        while (offset < this.field.texts[index].length) {
            let substr = this.field.texts[index].substr(offset, 1)
            let width = ctx.measureText(substr).width
            if (left <= x && x <= left + width) {
                if (x >= left + width / 2) offset++
                    break
            }
            left += width
            offset++
        }
        return {
            index: index,
            offset: offset
        }
    }
    Block.prototype.SetCursor = function(x, y, ctx) {
        let position = this.GetCursorPositionByPoint(x, y, ctx)
        this.field.ClearSelection()
        this.field.index = position.index
        this.field.offset = position.offset
    }
    Block.prototype.SetStartSelection = function(x, y, ctx) {
        let position = this.GetCursorPositionByPoint(x, y, ctx)
        this.field.index = position.index
        this.field.offset = position.offset
        this.field.selectionStartIndex = position.index
        this.field.selectionStartOffset = position.offset
        this.field.selectionEndIndex = -1
        this.field.selectionEndOffset = -1
    }
    Block.prototype.SetEndSelection = function(x, y, ctx) {
        let position = this.GetCursorPositionByPoint(x, y, ctx)
        this.field.index = position.index
        this.field.offset = position.offset
        this.field.selectionEndIndex = position.index
        this.field.selectionEndOffset = position.offset
    }
    Block.prototype.ReplaceMathChars = function() {
        this.field.ReplaceMathChars()
    }
    Block.prototype.ToJSON = function() {
        return {
            x: this.x,
            y: this.y,
            text: this.field.text,
            width: this.width,
            height: this.height,
            type: this.type,
            isMenuBlock: this.isMenuBlock,
            fontSize: this.fontSize,
            textHeight: this.textHeight,
            isBold: this.isBold,
            isItalic: this.isItalic,
            textAlign: this.textAlign,
            labelsPosition: this.labelsPosition
        }
    }
    
    function Arrow(startBlock, startConnector) {
        this.startBlock = startBlock
        this.startConnector = startConnector
        this.endBlock = null
        this.endConnector = null
        this.isActivated = false
        this.verticalFirst = true
        this.InitStart()
    }
    Arrow.prototype.InitStart = function() {
        this.nodes = []
        this.counts = []
        this.AddNode(this.startBlock.x + this.startConnector.x, this.startBlock.y + this.startConnector.y, false)
        this.AppendNode(Math.sign(this.startConnector.x) * GRID_SIZE * 2, Math.sign(this.startConnector.y) * GRID_SIZE * 2)
    }
    Arrow.prototype.Normalize = function(value) {
        return Math.floor((value + GRID_SIZE / 2) / GRID_SIZE) * GRID_SIZE
    }
    Arrow.prototype.AddDiagonalNode = function(x, y) {
        let last = this.nodes[this.nodes.length - 1]
        if (this.nodes.length > 1) {
            let dx1 = x - this.nodes[this.nodes.length - 1].x
            let dx2 = last.x - this.nodes[this.nodes.length - 2].x
            if (Math.sign(dx1) == Math.sign(dx2)) {
                this.nodes.push({
                    x: x,
                    y: last.y
                })
                return
            }
        }
        if (this.verticalFirst) {
            this.nodes.push({
                x: last.x,
                y: y
            })
        } else {
            this.nodes.push({
                x: x,
                y: last.y
            })
        }
    }
    Arrow.prototype.AddNode = function(x, y, normalize = true) {
        if (normalize) {
            x = this.Normalize(x)
            y = this.Normalize(y)
        }
        if (this.nodes.length == 0) {
            this.nodes.push({
                x: x,
                y: y
            })
            this.counts.push(1)
            return
        }
        let dx = x - this.nodes[this.nodes.length - 1].x
        let dy = y - this.nodes[this.nodes.length - 1].y
        if (dx != 0 && dy != 0) {
            this.counts.push(2)
            this.AddDiagonalNode(x, y)
        } else {
            this.counts.push(1)
        }
        this.nodes.push({
            x: x,
            y: y
        })
    }
    Arrow.prototype.AppendNode = function(dx, dy, normalize = true) {
        let last = this.nodes[this.nodes.length - 1]
        this.AddNode(last.x + dx, last.y + dy, normalize)
    }
    Arrow.prototype.RemoveNode = function() {
        if (this.nodes.length == 0) return
        let count = this.counts.pop()
        for (let i = 0; i < count; i++) this.nodes.pop()
    }
    Arrow.prototype.IsIntersectBlock = function(block) {
        for (let i = 1; i < this.nodes.length; i++)
            if (block.IsIntersectLine(this.nodes[i - 1], this.nodes[i])) return true
        return false
    }
    Arrow.prototype.GetSegmentInfo = function(i) {
        let x1 = Math.min(this.nodes[i - 1].x, this.nodes[i].x)
        let y1 = Math.min(this.nodes[i - 1].y, this.nodes[i].y)
        let x2 = Math.max(this.nodes[i - 1].x, this.nodes[i].x)
        let y2 = Math.max(this.nodes[i - 1].y, this.nodes[i].y)
        return {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        }
    }
    Arrow.prototype.IsMouseHover = function(x, y) {
        for (let i = 1; i < this.nodes.length; i++) {
            let segment = this.GetSegmentInfo(i)
            if (segment.x1 - ARROW_MOUSE_DISTANCE > x || segment.x2 + ARROW_MOUSE_DISTANCE < x) continue
            if (segment.y1 - ARROW_MOUSE_DISTANCE > y || segment.y2 + ARROW_MOUSE_DISTANCE < y) continue
            return true
        }
        return false
    }
    Arrow.prototype.GetMoveSegment = function(x, y) {
        for (let i = 2; i < this.nodes.length - 1; i++) {
            let x1 = (this.nodes[i].x + this.nodes[i - 1].x) / 2
            let y1 = (this.nodes[i].y + this.nodes[i - 1].y) / 2
            let dx = x - x1
            let dy = y - y1
            let segmentDx = this.nodes[i].x - this.nodes[i - 1].x
            let segmentDy = this.nodes[i].y - this.nodes[i - 1].y
            if (dx * dx + dy * dy < ARROW_SEGMENT_RADIUS * ARROW_SEGMENT_RADIUS) return {
                real: true,
                index: i,
                x: x1,
                y: y1,
                dx: segmentDx,
                dy: segmentDy
            }
            if (segmentDx == 0 && Math.abs(dx) < ARROW_SEGMENT_RADIUS && Math.abs(dy) < Math.abs(segmentDy) / 2) return {
                real: false,
                index: i,
                x: x1,
                y: y1,
                dx: Math.sign(segmentDx),
                dy: Math.sign(segmentDy)
            }
            if (segmentDy == 0 && Math.abs(dy) < ARROW_SEGMENT_RADIUS && Math.abs(dx) < Math.abs(segmentDx) / 2) return {
                real: false,
                index: i,
                x: x1,
                y: y1,
                dx: Math.sign(segmentDx),
                dy: Math.sign(segmentDy)
            }
        }
        return null
    }
    Arrow.prototype.GetVerticalSegment = function(x, y, diff) {
        for (let i = 1; i < this.nodes.length; i++) {
            let segment = this.GetSegmentInfo(i)
            if (segment.x1 != segment.x2) continue
            if (x < segment.x1 - diff || x > segment.x1 + diff || y < segment.y1 - diff || y > segment.y2 + diff) continue
            return {
                index: i,
                dy: this.nodes[i].y - this.nodes[i - 1].y
            }
        }
        return null
    }
    Arrow.prototype.GetBBox = function() {
        let bbox = {
            x1: this.nodes[0].x,
            y1: this.nodes[0].y,
            x2: this.nodes[0].x,
            y2: this.nodes[0].y
        }
        for (let i = 1; i < this.nodes.length; i++) {
            bbox.x1 = Math.min(bbox.x1, this.nodes[i].x)
            bbox.y1 = Math.min(bbox.y1, this.nodes[i].y)
            bbox.x2 = Math.max(bbox.x2, this.nodes[i].x)
            bbox.y2 = Math.max(bbox.y2, this.nodes[i].y)
        }
        return bbox
    }
    Arrow.prototype.AddPoint = function(x, y) {
        x = this.Normalize(x)
        y = this.Normalize(y)
        for (let i = 1; i < this.nodes.length; i++) {
            let segment = this.GetSegmentInfo(i)
            if (segment.x1 > x || x > segment.x2 || segment.y1 > y || y > segment.y2) continue
            if (!ADD_NODE_AS_POINT) {
                let len1 = Math.abs(x - segment.x1) + Math.abs(y - segment.y1)
                let len2 = Math.abs(x - segment.x2) + Math.abs(y - segment.y2)
                x = 2 * x - (len1 < len2 ? segment.x1 : segment.x2)
                y = 2 * y - (len1 < len2 ? segment.y1 : segment.y2)
            }
            this.nodes.splice(i, 0, {
                x: x,
                y: y
            })
            return
        }
    }
    Arrow.prototype.IsConnectToBlock = function(block) {
        for (let i = 0; i < block.connectors.length; i++) {
            if (this.startConnector == block.connectors[i]) return true
            if (this.endConnector == block.connectors[i]) return true
        }
        return false
    }
    Arrow.prototype.IsPointInLine = function(p, p1, p2) {
        let x1 = Math.min(p1.x, p2.x)
        let y1 = Math.min(p1.y, p2.y)
        let x2 = Math.max(p1.x, p2.x)
        let y2 = Math.max(p1.y, p2.y)
        return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
    }
    Arrow.prototype.GetIntersectionPoint = function(p1, p2, p3, p4) {
        let dirX1 = Math.abs(Math.sign(p2.x - p1.x))
        let dirY1 = Math.abs(Math.sign(p2.y - p1.y))
        let dirX2 = Math.abs(Math.sign(p4.x - p3.x))
        let dirY2 = Math.abs(Math.sign(p4.y - p3.y))
        if (dirX1 == dirX2 && dirY1 == dirY2) return null
        let x = dirX1 == 0 ? p1.x : p3.x
        let y = dirY1 == 0 ? p1.y : p3.y
        let p = {
            x: x,
            y: y
        }
        if (!this.IsPointInLine(p, p1, p2)) return null
        if (!this.IsPointInLine(p, p3, p4)) return null
        return p
    }
    Arrow.prototype.SegmentIntersection = function(nodes, point) {
        for (let i = 0; i < nodes.length; i++)
            if (nodes[i].x == point.x && nodes[i].y == point.y) return {
                index: i,
                point: point
            }
        for (let i = 1; i < nodes.length - 1; i++) {
            let p = this.GetIntersectionPoint(nodes[i - 1], nodes[i], nodes[nodes.length - 1], point)
            if (p != null) return {
                index: i,
                point: p
            }
        }
        return null
    }
    Arrow.prototype.OptimizeIntersection = function(nodes, point) {
        let result = this.SegmentIntersection(nodes, point)
        if (result != null) {
            nodes.splice(result.index, nodes.length - result.index)
            nodes.push(result.point)
        }
    }
    Arrow.prototype.OptimizeZeroSegment = function(nodes, point) {
        let j = nodes.length - 1
        let dirX = Math.sign(Math.abs(nodes[j].x - nodes[j - 1].x))
        let dirY = Math.sign(Math.abs(nodes[j].y - nodes[j - 1].y))
        let dx2 = point.x - nodes[j].x
        let dy2 = point.y - nodes[j].y
        if (nodes.length >= 2 && dirX == Math.sign(Math.abs(dx2)) && dirY == Math.sign(Math.abs(dy2))) {
            nodes[j].x += dx2
            nodes[j].y += dy2
            if (nodes[j].x - nodes[j - 1].x == 0 && nodes[j].y - nodes[j - 1].y == 0) nodes.pop()
        } else if (dx2 != 0 || dy2 != 0) {
            nodes.push(point)
        }
    }
    Arrow.prototype.OptimizeNodes = function(ignoreLast = true) {
        let nodes = []
        for (let i = 0; i < this.nodes.length; i++) {
            this.OptimizeIntersection(nodes, this.nodes[i])
            if (nodes.length < 2 || (ignoreLast && i == this.nodes.length - 1)) {
                nodes.push(this.nodes[i])
                continue
            }
            this.OptimizeZeroSegment(nodes, this.nodes[i])
        }
        this.nodes = nodes
        this.counts = []
        for (let i = 0; i < nodes.length; i++) this.counts[i] = 1
    }
    Arrow.prototype.Move = function(dx, dy) {
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodes[i].x += dx
            this.nodes[i].y += dy
        }
    }
    Arrow.prototype.MoveSegment = function(segment, dx, dy) {
        let index = segment.index
        if (segment.dx == 0) dy = 0
        if (segment.dy == 0) dx = 0
        let x1 = this.nodes[index - 1].x
        let y1 = this.nodes[index - 1].y
        let x2 = this.nodes[index].x
        let y2 = this.nodes[index].y
        let leftDx = Math.sign(Math.abs(this.nodes[index - 1].x - this.nodes[index - 2].x))
        let leftDy = Math.sign(Math.abs(this.nodes[index - 1].y - this.nodes[index - 2].y))
        let currDx = Math.sign(Math.abs(segment.dx))
        let currDy = Math.sign(Math.abs(segment.dy))
        let rightDx = Math.sign(Math.abs(this.nodes[index + 1].x - this.nodes[index].x))
        let rightDy = Math.sign(Math.abs(this.nodes[index + 1].y - this.nodes[index].y))
        if (currDx != leftDx && currDy != leftDy && currDx != rightDx && currDy != rightDy) {
            this.nodes[index].x += dx
            this.nodes[index].y += dy
            this.nodes[index - 1].x += dx
            this.nodes[index - 1].y += dy
            return
        }
        this.nodes.splice(index, 0, {
            x: x2 + dx,
            y: y2 + dy
        })
        this.nodes.splice(index, 0, {
            x: x1 + dx,
            y: y1 + dy
        })
        segment.index += 1
    }
    Arrow.prototype.Copy = function() {
        let arrow = new Arrow(this.startBlock, this.startConnector)
        arrow.endBlock = this.endBlock
        arrow.endConnector = this.endConnector
        arrow.isActivated = this.isActivated
        arrow.nodes = []
        arrow.counts = []
        for (let i = 0; i < this.nodes.length; i++) arrow.nodes.push({
            x: this.nodes[i].x,
            y: this.nodes[i].y
        })
        for (let i = 0; i < this.counts.length; i++) arrow.counts.push(this.counts[i])
        return arrow
    }
    Arrow.prototype.IsEqual = function(arrow) {
        if (this == arrow) return true
        if (this.startBlock != arrow.startBlock || this.startConnector != arrow.startConnector) return false
        if (this.endBlock != arrow.endBlock || this.endConnector != arrow.endConnector) return false
        if (this.nodes.length != arrow.nodes.length) return false
        for (let i = 0; i < this.nodes.length; i++)
            if (this.nodes[i].x != arrow.nodes[i].x || this.nodes[i].y != arrow.nodes[i].y) return false
        return true
    }
    Arrow.prototype.IsNearlyEqual = function(arrow) {
        if (this == arrow) return true
        if (this.startBlock != arrow.startBlock || this.startConnector != arrow.startConnector) return false
        if (this.endBlock != arrow.endBlock || this.endConnector != arrow.endConnector) return false
        return true
    }
    Arrow.prototype.SetActivated = function(isActivated) {
        this.isActivated = isActivated
    }
    Arrow.prototype.SegmentIntersectionsCount = function(blocks, arrows, p1, p2) {
        let intersections = 0
        for (let i = 0; i < blocks.length; i++)
            if (blocks[i].IsIntersectLine(p1, p2)) intersections++
                for (let i = 0; i < arrows.length; i++) {
                    if (arrows[i] == this || (arrows[i].endBlock == this.endBlock && arrows[i].endConnector == this.endConnector)) continue
                    for (let j = 1; j < arrows[i].nodes.length; j++)
                        if (this.GetIntersectionPoint(p1, p2, arrows[i].nodes[j - 1], arrows[i].nodes[j])) intersections++
                }
            return intersections
    }
    Arrow.prototype.MakeSegment = function(dirX, dirY, index, blocks, arrows) {
        let endX = this.endBlock.x + this.endConnector.x + Math.sign(this.endConnector.x) * GRID_SIZE * 2
        let endY = this.endBlock.y + this.endConnector.y + Math.sign(this.endConnector.y) * GRID_SIZE * 2
        let node = this.nodes[this.nodes.length - 1]
        let nextSegmentSize = Math.abs((endX - node.x) * dirX[index + 1]) + Math.abs((endY - node.y) * dirY[index + 1])
        let maxChecks = Math.abs((endX - node.x) * dirX[index]) + Math.abs((endY - node.y) * dirY[index])
        let step = GRID_SIZE
        if (maxChecks < 100) maxChecks = 100
        let imin = -1
        let minIntersections = 0
        let minDst = 0
        for (let i = 0; i < maxChecks; i++) {
            let x1 = node.x + i * dirX[index] * step
            let y1 = node.y + i * dirY[index] * step
            let x2 = x1 + dirX[index + 1] * nextSegmentSize
            let y2 = y1 + dirY[index + 1] * nextSegmentSize
            let intersections = this.SegmentIntersectionsCount(blocks, arrows, node, {
                x: x1,
                y: y1
            }) + this.SegmentIntersectionsCount(blocks, arrows, {
                x: x1,
                y: y1
            }, {
                x: x2,
                y: y2
            })
            let dst = Math.abs(x1 - endX) + Math.abs(y1 - endY)
            if (imin == -1 || intersections < minIntersections || (intersections == minIntersections && dst <= minDst)) {
                minIntersections = intersections
                minDst = dst
                imin = i
            }
        }
        this.AppendNode(imin * dirX[index] * step, imin * dirY[index] * step)
    }
    Arrow.prototype.FindOptimalSegment = function(index, dx, dy, blocks, arrows, maxChecks) {
        let imin = -1
        let minIntersections = 0
        for (let i = 0; i < maxChecks; i += GRID_SIZE) {
            let p1 = this.nodes[this.nodes.length - index]
            let p2 = this.nodes[this.nodes.length - index - 1]
            let intersections = this.SegmentIntersectionsCount(blocks, arrows, {
                x: p1.x + dx * i,
                y: p1.y + dy * i
            }, {
                x: p2.x + dx * i,
                y: p2.y + dy * i
            })
            if (imin == -1 || intersections <= minIntersections) {
                imin = i
                minIntersections = intersections
            }
        }
        this.nodes[this.nodes.length - index].x += dx * imin
        this.nodes[this.nodes.length - index].y += dy * imin
        this.nodes[this.nodes.length - index - 1].x += dx * imin
        this.nodes[this.nodes.length - index - 1].y += dy * imin
    }
    Arrow.prototype.TraceForLoopArrow = function(endBlock, endConnector, blocks, arrows) {
        let xmin = blocks[0].left
        let xmax = blocks[0].right
        let ymin = blocks[0].top
        let ymax = blocks[0].bottom
        for (let i = 1; i < blocks.length; i++) {
            xmin = Math.min(xmin, blocks[i].left)
            xmax = Math.max(xmax, blocks[i].right)
            ymin = Math.min(xmin, blocks[i].top)
            ymax = Math.max(xmax, blocks[i].bottom)
        }
        let node = this.nodes[this.nodes.length - 1]
        node.x += xmax - xmin
        this.AddNode(node.x, node.y + 2 * GRID_SIZE + ymax - ymin)
        this.AddNode(endBlock.x + endConnector.x - 2 * GRID_SIZE - (xmax - xmin), node.y + 2 * GRID_SIZE + ymax - ymin)
        this.AddNode(endBlock.x + endConnector.x - 2 * GRID_SIZE - (xmax - xmin), endBlock.y + endConnector.y)
        this.AddNode(endBlock.x + endConnector.x, endBlock.y + endConnector.y, false)
        this.FindOptimalSegment(3, 0, -1, blocks, arrows, ymax - ymin)
        this.FindOptimalSegment(2, 1, 0, blocks, arrows, xmax - xmin)
        this.FindOptimalSegment(4, -1, 0, blocks, arrows, xmax - xmin)
        this.OptimizeNodes()
    }
    Arrow.prototype.TraceTo = function(endBlock, endConnector, blocks, arrows) {
        let startDirX = Math.sign(this.nodes[this.nodes.length - 1].x - this.nodes[this.nodes.length - 2].x)
        let startDirY = Math.sign(this.nodes[this.nodes.length - 1].y - this.nodes[this.nodes.length - 2].y)
        let endDirX = -Math.sign(endConnector.x)
        let endDirY = -Math.sign(endConnector.y)
        this.endBlock = endBlock
        this.endConnector = endConnector
        if (startDirX == 1 && endDirX == 1 && this.nodes[this.nodes.length - 1].y > endBlock.y + endConnector.y && this.nodes[this.nodes.length - 1].x > endBlock.x + endConnector.x) {
            this.TraceForLoopArrow(endBlock, endConnector, blocks, arrows)
            return
        }
        let dirX = [1, 0, -1, 0, 1, 0]
        let dirY = [0, 1, 0, -1, 0, 1]
        if (startDirX == -1 && endDirY == 1 && this.nodes[this.nodes.length - 1].y < endBlock.y + endConnector.y) {
            dirX = [1, 0, -1, 0, 1]
            dirY = [0, 1, 0, -1, 0]
        } else if (startDirY == 1 && endDirY == 1 && this.nodes[this.nodes.length - 1].y < endBlock.y + endConnector.y) {
            dirX = [0, 1, 0, 1]
            dirY = [1, 0, 1, 0]
        }
        let first = 0
        while (dirX[first] != startDirX || dirY[first] != startDirY) first++
            let last = dirX.length - 1
        while (dirX[last] != endDirX || dirY[last] != endDirY) last--
            for (let i = first; i < last; i++) this.MakeSegment(dirX, dirY, i, blocks, arrows)
        let endX = endBlock.x + endConnector.x
        let endY = endBlock.y + endConnector.y
        this.AddNode(endX + Math.sign(endConnector.x) * GRID_SIZE * 2, endY + Math.sign(endConnector.y) * GRID_SIZE * 2)
        this.AddNode(endX, endY, false)
        this.OptimizeNodes()
    }
    Arrow.prototype.Retrace = function(blocks, arrows, forcibly = false) {
        let dx1 = this.startBlock.x + this.startConnector.x - this.nodes[0].x
        let dy1 = this.startBlock.y + this.startConnector.y - this.nodes[0].y
        let dx2 = this.endBlock.x + this.endConnector.x - this.nodes[this.nodes.length - 1].x
        let dy2 = this.endBlock.y + this.endConnector.y - this.nodes[this.nodes.length - 1].y
        if (dx1 == dx2 && dy1 == dy2 && !forcibly) {
            this.Move(dx1, dy1)
        } else {
            this.InitStart()
            this.TraceTo(this.endBlock, this.endConnector, blocks, arrows)
        }
    }
    Arrow.prototype.Restore = function(arrow, endBlock, endConnector) {
        this.endBlock = endBlock
        this.endConnector = endConnector
        for (let i = 2; i < arrow.nodes.length; i++) this.AddNode(arrow.nodes[i].x, arrow.nodes[i].y)
        let endX = endBlock.x + endConnector.x
        let endY = endBlock.y + endConnector.y
        this.AddNode(endX + Math.sign(endConnector.x) * GRID_SIZE * 2, endY + Math.sign(endConnector.y) * GRID_SIZE * 2)
        this.AddNode(endX, endY, false)
        this.OptimizeNodes()
    }
    Arrow.prototype.Reverse = function() {
        let block = this.startBlock
        this.startBlock = this.endBlock
        this.endBlock = block
        let connector = this.startConnector
        this.startConnector = this.endConnector
        this.endConnector = connector
        for (let i = 0, j = this.nodes.length - 1; i < j; i++, j--) {
            let tmp = this.nodes[i]
            this.nodes[i] = this.nodes[j]
            this.nodes[j] = tmp
        }
        for (let i = 0, j = this.counts.length - 1; i < j; i++, j--) {
            let tmp = this.counts[i]
            this.counts[i] = this.counts[j]
            this.counts[j] = tmp
        }
    }
    Arrow.prototype.DrawEnd = function(ctx, x0, y0, scale) {
        let last = this.nodes[this.nodes.length - 1]
        let dx = last.x - this.nodes[this.nodes.length - 2].x
        let dy = last.y - this.nodes[this.nodes.length - 2].y
        ctx.beginPath()
        if (Math.abs(dy) >= Math.abs(dx)) {
            ctx.moveTo((last.x - ARROW_DX) * scale + x0, (last.y - ARROW_DY * Math.sign(dy)) * scale + y0)
            ctx.lineTo(last.x * scale + x0, last.y * scale + y0)
            ctx.lineTo((last.x + ARROW_DX) * scale + x0, (last.y - ARROW_DY * Math.sign(dy)) * scale + y0)
        } else {
            ctx.moveTo((last.x - ARROW_DY * Math.sign(dx)) * scale + x0, (last.y - ARROW_DX) * scale + y0)
            ctx.lineTo(last.x * scale + x0, last.y * scale + y0)
            ctx.lineTo((last.x - ARROW_DY * Math.sign(dx)) * scale + x0, (last.y + ARROW_DX) * scale + y0)
        }
        ctx.closePath()
        ctx.fill()
    }
    Arrow.prototype.DrawNodes = function(ctx, x0, y0, scale) {
        ctx.fillStyle = ARROW_ACTIVE_COLOR[DARK_THEME]
        for (let i = 1; i < this.nodes.length - 1; i++) {
            ctx.beginPath()
            ctx.arc(this.nodes[i].x * scale + x0, this.nodes[i].y * scale + y0, (ARROW_NODE_RADIUS - 1) * scale, 0, Math.PI * 2)
            ctx.fill()
        }
        for (let i = 2; i < this.nodes.length - 1; i++) {
            let x = (this.nodes[i].x + this.nodes[i - 1].x) / 2
            let y = (this.nodes[i].y + this.nodes[i - 1].y) / 2
            ctx.beginPath()
            ctx.arc(x * scale + x0, y * scale + y0, ARROW_NODE_RADIUS * scale, 0, Math.PI * 2)
            ctx.fill()
        }
    }
    Arrow.prototype.Draw = function(ctx, x0, y0, scale, color = null) {
        if (this.nodes.length < 2) return
        if (color == null) {
            ctx.strokeStyle = this.isActivated ? ARROW_ACTIVE_COLOR[DARK_THEME] : ARROW_COLOR[DARK_THEME]
            ctx.fillStyle = this.isActivated ? ARROW_ACTIVE_COLOR[DARK_THEME] : ARROW_COLOR[DARK_THEME]
        } else {
            ctx.strokeStyle = color
            ctx.fillStyle = color
        }
        ctx.lineWidth = ARROW_WIDTH
        if (scale > 1) ctx.lineWidth *= scale
        if (this.endBlock != null && this.endBlock.IsText()) {
            ctx.setLineDash([GRID_SIZE / 2 * scale, GRID_SIZE / 2 * scale])
        }
        ctx.beginPath()
        ctx.moveTo(this.nodes[0].x * scale + x0, this.nodes[0].y * scale + y0)
        for (let i = 1; i < this.nodes.length; i++) ctx.lineTo(this.nodes[i].x * scale + x0, this.nodes[i].y * scale + y0)
        ctx.stroke()
        if (this.endBlock == null || !this.endBlock.IsText()) this.DrawEnd(ctx, x0, y0, scale)
        if (this.isActivated) this.DrawNodes(ctx, x0, y0, scale)
        ctx.setLineDash([])
        if (this.endBlock != null && this.endBlock.IsText()) {
            this.endBlock.DrawCommentLine(ctx, x0, y0, scale, this.endConnector)
        }
    }
    Arrow.prototype.ToJSON = function(blocks) {
        let startIndex = blocks.indexOf(this.startBlock)
        let endIndex = blocks.indexOf(this.endBlock)
        let startConnectorIndex = this.startBlock.connectors.indexOf(this.startConnector)
        let endConnectorIndex = this.endBlock.connectors.indexOf(this.endConnector)
        return {
            startIndex: startIndex,
            endIndex: endIndex,
            startConnectorIndex: startConnectorIndex,
            endConnectorIndex: endConnectorIndex,
            nodes: this.nodes,
            counts: this.counts
        }
    }
    
    function TouchEvents(diagram) {
        this.diagram = diagram
        let events = this
        document.ontouchstart = function(e) {
            events.TouchStart(e)
        }
        document.ontouchmove = function(e) {
            events.TouchMove(e)
        }
        document.ontouchend = function(e) {
            events.TouchEnd(e)
        }
    }
    TouchEvents.prototype.TouchStart = function(e) {
        e.preventDefault()
        this.prevTouchPoints = []
        if (e.targetTouches.length == 2) {
            this.prevTouchPoints.push({
                x: e.targetTouches[0].clientX,
                y: e.targetTouches[0].clientY - CANVAS_OFFSET
            })
            this.prevTouchPoints.push({
                x: e.targetTouches[1].clientX,
                y: e.targetTouches[1].clientY - CANVAS_OFFSET
            })
        } else if (e.targetTouches.length == 1) {
            e.offsetX = e.targetTouches[0].clientX
            e.offsetY = e.targetTouches[0].clientY - CANVAS_OFFSET
            e.button = 0
            this.diagram.MouseDown(e)
        }
    }
    TouchEvents.prototype.GetDistance = function(p1, p2) {
        let dx = p2.x - p1.x
        let dy = p2.y - p1.y
        return Math.sqrt(dx * dx + dy * dy)
    }
    TouchEvents.prototype.TouchMove = function(e) {
        e.preventDefault()
        if (e.targetTouches.length > 2 || e.targetTouches.length == 0) return
        if (e.targetTouches.length == 1) {
            e.offsetX = e.targetTouches[0].clientX
            e.offsetY = e.targetTouches[0].clientY - CANVAS_OFFSET
            e.button = 0
            this.diagram.MouseMove(e)
            return
        }
        let p1 = {
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY - CANVAS_OFFSET
        }
        let p2 = {
            x: e.targetTouches[1].clientX,
            y: e.targetTouches[1].clientY - CANVAS_OFFSET
        }
        let prevDistance = this.GetDistance(this.prevTouchPoints[0], this.prevTouchPoints[1])
        let currDistance = this.GetDistance(p1, p2)
        if (Math.abs(currDistance - prevDistance) < 25) {
            let dirX1 = Math.sign(p1.x - this.prevTouchPoints[0].x)
            let dirX2 = Math.sign(p2.x - this.prevTouchPoints[1].x)
            let dirY1 = Math.sign(p1.y - this.prevTouchPoints[0].y)
            let dirY2 = Math.sign(p2.y - this.prevTouchPoints[1].y)
            if (dirX1 == dirX2 && dirX1 != 0) {
                this.diagram.x0 += Math.max(p1.x - this.prevTouchPoints[0].x, p2.x - this.prevTouchPoints[1].x)
                this.prevTouchPoints[0].x = p1.x
                this.prevTouchPoints[1].x = p2.x
            }
            if (dirY1 == dirY2 && dirY1 != 0) {
                this.diagram.y0 += Math.max(p1.y - this.prevTouchPoints[0].y, p2.y - this.prevTouchPoints[1].y)
                this.prevTouchPoints[0].y = p1.y
                this.prevTouchPoints[1].y = p2.y
            }
        } else {
            this.diagram.currPoint.x = (p1.x + p2.x) / 2
            this.diagram.currPoint.y = (p1.y + p2.y) / 2
            if (currDistance > prevDistance) {
                this.diagram.UpdateScale(1)
            } else {
                this.diagram.UpdateScale(-1)
            }
            this.prevTouchPoints[0] = p1
            this.prevTouchPoints[1] = p2
        }
    }
    TouchEvents.prototype.TouchEnd = function(e) {
        e.preventDefault()
        if (this.prevTouchPoints.length == 0) this.diagram.MouseUp(e)
        this.prevTouchPoints = []
    }
    
    function Diagram(canvas, input, sourceInput, textInput) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.WindowResize()
        this.input = input
        this.sourceInput = sourceInput
        this.textInput = textInput
        this.name = "diagram"
        this.x0 = 0
        this.y0 = 0
        this.scales = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8, 16]
        this.scaleIndex = 4
        this.Init()
        this.InitIcons()
        this.InitEvents()
        this.InitMenuBlocks()
        this.needTips = true
        let diagram = this
        setTimeout(function() {
            diagram.needTips = false
        }, TIPS_TIMEOUT)
    }
    Diagram.prototype.Init = function() {
        this.blocks = []
        this.arrows = []
        this.scale = this.scales[this.scaleIndex]
        this.mode = BLOCK_MODE
        this.needDrawGrid = true
        this.needKeyboardMenu = false
        this.isFullMenu = this.width > MENU_FULL_MIN_SIZE
        this.isEdit = false
        this.isDragDrop = false;
        this.shiftKey = false
        this.isPressed = false
        this.isControlPressed = false
        this.prevPoint = {
            x: 0,
            y: 0
        }
        this.currPoint = {
            x: -1,
            y: -1
        }
        this.currRealPoint = {
            x: -1,
            y: -1
        }
        this.currBlockIndex = 0
        this.activeBlock = null
        this.activeResizePoint = null
        this.activeArrow = null
        this.activatedArrow = null
        this.activeSegment = null
        this.action = ''
        this.history = []
        this.antiHistory = []
        this.copyBuffer = null
        this.currSelection = null
    }
    Diagram.prototype.GetIcons = function(id, iconsCount = 4) {
        let icons = []
        let names = ['-dark', '', '-active-dark', '-active']
        for (let i = 0; i < iconsCount; i++) icons.push(document.getElementById(id + names[i]))
        return icons
    }
    Diagram.prototype.GetIconsForItems = function(items) {
        icons = []
        for (let i = 0; i < items.length; i++) icons.push(this.GetIcons(items[i]))
        return icons
    }
    Diagram.prototype.InitIcons = function() {
        this.keyboardIcons = this.GetIcons('keyboard')
        // this.keyboardIcons.push(document.getElementById("keyboard-dark"))
        // this.keyboardIcons.push(document.getElementById("keyboard"))
        // this.keyboardIcons.push(document.getElementById("keyboard-active-dark"))
        // this.keyboardIcons.push(document.getElementById("keyboard-active"))
        let jsonIcons = this.GetIcons('download', 3)
        let pngIcons = this.GetIcons('image', 3)
        let areasIcons = this.GetIcons('areas', 3)
        let uploadIcons = this.GetIcons('upload', 3)
        let themeIcons = this.GetIcons('theme', 3)
        let instructionIcons = this.GetIcons('instruction', 3)
        this.menuIcons = [jsonIcons, uploadIcons, pngIcons, areasIcons, themeIcons, instructionIcons]
        let undoIcons = this.GetIcons('undo')
        let repeatIcons = this.GetIcons("repeat")
        let zoomOutIcons = this.GetIcons("zoom-out")
        let zoomInIcons = this.GetIcons("zoom-in")
        let gridIcons = this.GetIcons("grid").concat(this.GetIcons("hide-grid"))
        this.bottomMenuIcons = [undoIcons, repeatIcons, zoomOutIcons, zoomInIcons, gridIcons]
        this.removeIcons = this.GetIcons("minus")
        let blockIcons = this.GetIcons('block', 2)
        let arrowIcons = this.GetIcons('arrow', 2)
        this.infoIcons = [blockIcons, arrowIcons, zoomOutIcons, zoomInIcons]
        // let editIcons = this.GetIcons('edit')
        // let boldIcons = this.GetIcons('bold')
        // let italicIcons = this.GetIcons('italic')
        // let increaseIcons = this.GetIcons('increase-font')
        // let decreaseIcons = this.GetIcons('decrease-font')
        // let leftAlignIcons = this.GetIcons('left-align')
        // let centerAlignIcons = this.GetIcons('center-align')
        // let changeIcons = this.GetIcons('change')
        this.rightItems = ['edit', 'left-align', 'center-align', 'bold', 'italic', 'increase-font', 'decrease-font', 'change']
        this.rightIcons = this.GetIconsForItems(this.rightItems)
        this.rightHints = ['Редактирование', 'Выравнивание по левому краю', 'Выравнивание по центру', 'Жирность', 'Курсив', 'Увеличение размера шрифта', 'Уменьшение размера шрифта', 'Смените метки']
    }
    Diagram.prototype.InitEvents = function() {
        let diagram = this
        document.onmousemove = function(e) {
            diagram.MouseMove(e)
        }
        document.onmousedown = function(e) {
            diagram.MouseDown(e)
        }
        document.onmouseup = function(e) {
            diagram.MouseUp(e)
        }
        document.onwheel = function(e) {
            diagram.MouseWheel(e)
        }
        document.onkeydown = function(e) {
            diagram.KeyDown(e)
        }
        document.onkeyup = function(e) {
            diagram.KeyUp(e)
        }
        document.onkeypress = function(e) {
            diagram.KeyPress(e)
        }
        document.onpaste = function(e) {
            diagram.PasteText(e)
        }
        document.oncopy = function(e) {
            diagram.CopyText(e)
        }
        document.oncut = function(e) {
            diagram.CutText(e)
        }
        window.onresize = function() {
            diagram.WindowResize()
        }
        window.onbeforeunload = function(e) {
            e.returnValue = ' ';
            return ' '
        }
        // let touchEvents = new TouchEvents(this)
        this.canvas.ondragover = function(e) {
            diagram.DragOver(e);
            return false
        }
        this.canvas.ondragleave = function(e) {
            diagram.DragLeave(e);
            return false
        }
        this.canvas.ondrop = function(e) {
            diagram.Drop(e);
            return false
        }
        this.input.onchange = function() {
            diagram.ReadFile(diagram.input)
        }
        this.sourceInput.onchange = function() {
            diagram.ReadFile(diagram.sourceInput)
        }
        this.textInput.addEventListener('textInput', function(e) {
            e.key = e.data;
            diagram.KeyPress(e)
        })
    }
    Diagram.prototype.InitMenuBlocks = function() {
        this.menuBlocks = []
        for (let i = 0; i < BLOCK_TYPES.length; i++) {
            let x = MENU_X0 + BLOCKS_MENU_BLOCK_WIDTH / 2
            let y = BLOCKS_MENU_Y0 + BLOCKS_MENU_DY / 2 + (BLOCKS_MENU_BLOCK_HEIGHT + BLOCKS_MENU_DY) * i
            let width = BLOCK_TYPES[i] != IN_OUT_TYPE ? BLOCKS_MENU_BLOCK_WIDTH : BLOCKS_MENU_BLOCK_WIDTH - IN_OUT_DX / 2
            this.menuBlocks.push(new Block(x, y, "", width, BLOCKS_MENU_BLOCK_HEIGHT, BLOCK_TYPES[i], true))
        }
    }
    Diagram.prototype.AddBlock = function(block, saveHistory = true) {
        this.blocks.push(block)
        this.activeBlock = block
        if (saveHistory) this.AddHistory(ACTION_ADD_BLOCK, {
            block: block
        })
    }
    Diagram.prototype.AddArrow = function(arrow, saveHistory = true) {
        if (this.AlreadyHaveConnection(arrow)) this.RemoveArrow(arrow)
        this.arrows.push(arrow)
        if (saveHistory) this.AddHistory(ACTION_ADD_ARROW, {
            arrow: arrow
        })
    }
    Diagram.prototype.CanJoinAction = function(action, args) {
        if (this.history.length == 0) return false
        let last = this.history[this.history.length - 1]
        if (action != last.action) return false
        if (action == ACTION_MOVE || action == ACTION_EDIT_BLOCK) return args.block == last.args.block
        if (action == ACTION_RESIZE) return last.args.dirX == args.dirX && last.args.dirY == args.dirY
        if (action == ACTION_SELECT) return last.args.selection == args.selection
        return false
    }
    Diagram.prototype.JoinAction = function(action, args) {
        let last = this.history[this.history.length - 1]
        if (action == ACTION_MOVE || action == ACTION_RESIZE || action == ACTION_SELECT) {
            last.args.dx += args.dx
            last.args.dy += args.dy
            if (action == ACTION_RESIZE && last.args.dx * last.args.dirX == 0 && last.args.dy * last.args.dirY == 0) {
                this.history.pop()
            } else if (action == ACTION_MOVE && last.args.dx == 0 && last.args.dy == 0) {
                this.history.pop()
            }
        } else if (action == ACTION_EDIT_BLOCK) {
            last.args.currText = args.currText
        }
    }
    Diagram.prototype.AddHistory = function(action, args) {
        this.antiHistory = []
        if (this.CanJoinAction(action, args)) {
            this.JoinAction(action, args)
            return
        }
        this.history.push({
            action: action,
            args: args
        })
    }
    Diagram.prototype.IsMouseInMenu = function(x) {
        return x < MENU_WIDTH[this.isFullMenu]
    }
    Diagram.prototype.IsMouseInRightMenu = function(x, y) {
        if (this.activeBlock == null || x < this.width + RIGHT_MENU_X0) return false
        if (this.activeBlock.CanSwapLabelsOrText()) return y < this.rightIcons.length * RIGHT_MENU_ICON_SIZE
        return y < (this.rightIcons.length - 1) * RIGHT_MENU_ICON_SIZE
    }
    Diagram.prototype.GetKeyboardMenuX0 = function() {
        return Math.max(MENU_WIDTH[this.isFullMenu], (this.width - KEYBOARD_CHARACTERS_PER_ROW * KEYBOARD_KEY_SIZE) / 2)
    }
    Diagram.prototype.GetKeyboardMenuKeyPosition = function() {
        let x0 = this.GetKeyboardMenuX0()
        let row = Math.floor(this.currPoint.y / KEYBOARD_KEY_SIZE)
        let column = Math.floor((this.currPoint.x - x0) / KEYBOARD_KEY_SIZE)
        return {
            row: row,
            column: column,
            index: row * KEYBOARD_CHARACTERS_PER_ROW + column
        }
    }
    Diagram.prototype.IsMouseInKeyboardMenu = function(x, y) {
        if (!this.isEdit || !this.needKeyboardMenu) return false
        let x0 = this.GetKeyboardMenuX0()
        return x >= x0 && x <= x0 + KEYBOARD_CHARACTERS_PER_ROW * KEYBOARD_KEY_SIZE && y < KEYBOARD_KEY_SIZE * KEYBOARD_CHARACTERS_ROWS
    }
    Diagram.prototype.MoveBlockDown = function(index) {
        let block = this.blocks[index]
        this.blocks.splice(index, 1)
        this.blocks.push(block)
        return block
    }
    Diagram.prototype.DisableEdit = function() {
        if (this.activeBlock != null && this.isEdit) this.activeBlock.EndEdit()
        this.textInput.blur()
        this.canvas.focus()
        this.isEdit = false
    }
    Diagram.prototype.GetBlockByPoint = function(x, y) {
        for (let i = this.blocks.length - 1; i >= 0; i--)
            if (this.blocks[i].IsMouseHover(x, y)) return this.MoveBlockDown(i)
        return null
    }
    Diagram.prototype.GetBlockAndResizePointByPoint = function(x, y) {
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            let point = this.blocks[i].GetResizePoint(x, y)
            if (point != null) return {
                block: this.MoveBlockDown(i),
                point: point
            }
        }
        return {
            block: this.GetBlockByPoint(x, y),
            point: null
        }
    }
    Diagram.prototype.GetBlockAndConnectorByPoint = function(x, y) {
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            let connector = this.blocks[i].GetConnector(x, y)
            if (this.activeArrow != null && this.activeArrow.startBlock == this.blocks[i] && this.activeArrow.startConnector == connector) continue
            if (connector != null) return {
                block: this.blocks[i],
                connector: connector
            }
        }
        return {
            block: this.GetBlockByPoint(x, y),
            connector: null
        }
    }
    Diagram.prototype.GetBlockAndConnectorByBlock = function() {
        for (let i = 0; i < this.blocks.length; i++) {
            if (this.blocks[i] == this.activeBlock) continue
            for (let j = 0; j < this.activeBlock.connectors.length; j++) {
                let x = this.activeBlock.connectors[j].posX
                let y = this.activeBlock.connectors[j].posY
                let connector = this.blocks[i].GetConnector(x, y)
                if (connector == null) continue
                if (this.HaveOutputConnection(this.blocks[i], connector)) continue
                if (this.HaveConnection(this.activeBlock, this.activeBlock.connectors[j], this.blocks[i], connector)) continue
                return {
                    block: this.blocks[i],
                    connector1: connector,
                    connector2: this.activeBlock.connectors[j]
                }
            }
        }
        return null
    }
    Diagram.prototype.GetArrowByPoint = function(x, y) {
        for (let i = 0; i < this.arrows.length; i++)
            if (this.arrows[i].IsMouseHover(x, y)) return this.arrows[i]
        return null
    }
    Diagram.prototype.GetArrowAndVerticalSegmentByPoint = function(x, y) {
        for (let i = 0; i < this.arrows.length; i++) {
            let segment = this.arrows[i].GetVerticalSegment(x, y, GRID_SIZE)
            if (segment != null) return {
                arrow: this.arrows[i],
                segment: segment
            }
        }
        return null
    }
    Diagram.prototype.HaveOutputConnection = function(block, connector) {
        for (let i = 0; i < this.arrows.length; i++)
            if (this.arrows[i].startBlock == block && this.arrows[i].startConnector == connector) return true
        return false
    }
    Diagram.prototype.HaveConnection = function(block1, connector1, block2, connector2) {
        for (let i = 0; i < this.arrows.length; i++) {
            if (this.arrows[i].startBlock != block1 || this.arrows[i].startConnector != connector1) continue
            if (this.arrows[i].endBlock != block2 || this.arrows[i].endConnector != connector2) continue
            return true
        }
        return false
    }
    Diagram.prototype.IsBlockConnectToBlock = function(block1, block2) {
        for (let i = 0; i < this.arrows.length; i++)
            if (this.arrows[i].IsConnectToBlock(block1) && this.arrows[i].IsConnectToBlock(block2)) return true
        return false
    }
    Diagram.prototype.HasBlockConnections = function(block) {
        for (let i = 0; i < this.arrows.length; i++)
            if (this.arrows[i].IsConnectToBlock(block)) return true
        return false
    }
    Diagram.prototype.IsBlockConnectToArea = function(block, area) {
        for (let i = 0; i < area.length; i++)
            if (this.IsBlockConnectToBlock(block, area[i])) return true
        return false
    }
    Diagram.prototype.IndexOfArea = function(areas, index) {
        for (let i = 0; i < areas.length; i++) {
            if (i == index) continue
            for (let j = 0; j < areas[index].length; j++)
                if (this.IsBlockConnectToArea(areas[index][j], areas[i])) return i
        }
        return -1
    }
    Diagram.prototype.GetRelatedAreas = function() {
        let areas = []
        for (let i = 0; i < this.blocks.length; i++)
            if (this.HasBlockConnections(this.blocks[i])) areas.push([this.blocks[i]])
        let changed = true
        while (changed) {
            changed = false
            for (let i = areas.length - 1; i >= 0; i--) {
                let index = this.IndexOfArea(areas, i)
                if (index > -1) {
                    areas[index] = areas[index].concat(areas[i])
                    changed = true
                    areas.splice(i, 1)
                }
            }
        }
        return areas
    }
    Diagram.prototype.GetAreaInfo = function(area) {
        let bbox = {
            x1: area[0].left,
            y1: area[0].top,
            x2: area[0].right,
            y2: area[0].bottom
        }
        let arrows = []
        for (let i = 0; i < area.length; i++) {
            bbox.x1 = Math.min(bbox.x1, area[i].left)
            bbox.y1 = Math.min(bbox.y1, area[i].top)
            bbox.x2 = Math.max(bbox.x2, area[i].right)
            bbox.y2 = Math.max(bbox.y2, area[i].bottom)
            for (let j = 0; j < this.arrows.length; j++) {
                if (!this.arrows[j].IsConnectToBlock(area[i])) continue
                arrows.push(this.arrows[j])
                let arrowBox = this.arrows[j].GetBBox()
                bbox.x1 = Math.min(bbox.x1, arrowBox.x1)
                bbox.y1 = Math.min(bbox.y1, arrowBox.y1)
                bbox.x2 = Math.max(bbox.x2, arrowBox.x2)
                bbox.y2 = Math.max(bbox.y2, arrowBox.y2)
            }
        }
        bbox.x1 -= GRID_SIZE * 2
        bbox.y1 -= GRID_SIZE * 2
        bbox.x2 += GRID_SIZE * 2
        bbox.y2 += GRID_SIZE * 2
        return {
            bbox: bbox,
            arrows: arrows
        }
    }
    Diagram.prototype.ClearArrowsActivation = function() {
        for (let i = 0; i < this.arrows.length; i++) this.arrows[i].SetActivated(false)
        if (this.activatedArrow != null) this.activatedArrow.SetActivated(false)
    }
    Diagram.prototype.RetraceArrows = function() {
        let arrows = []
        for (let i = 0; i < this.arrows.length; i++) {
            if (this.arrows[i].IsConnectToBlock(this.activeBlock)) {
                arrows.push(this.arrows[i].Copy())
                this.arrows[i] = this.arrows[i].Copy()
                this.arrows[i].Retrace(this.blocks, this.arrows)
            }
        }
        return arrows
    }
    Diagram.prototype.UpdateArrows = function(arrows) {
        for (let i = 0; i < arrows.length; i++) {
            this.RemoveArrow(arrows[i])
            this.AddArrow(arrows[i], false)
        }
    }
    Diagram.prototype.MoveActiveBlock = function(dx, dy, saveHistory = true, restoreArrows = null) {
        if (this.activeBlock == null) return
        this.activeBlock.Move(dx, dy)
        if (restoreArrows == null) {
            restoreArrows = this.RetraceArrows()
        } else {
            this.UpdateArrows(restoreArrows)
        }
        if (saveHistory) this.AddHistory(ACTION_MOVE, {
            block: this.activeBlock,
            dx: dx,
            dy: dy,
            arrows: restoreArrows
        })
    }
    Diagram.prototype.ResizeActiveBlock = function(dx, dy, dirX, dirY, saveHistory = true, restoreArrows = null) {
        if (this.activeBlock == null) return
        if (!this.activeBlock.CanResize(dx, dy, dirX, dirY)) {
            this.prevPoint.x -= dx * Math.abs(dirX) * this.scale
            this.prevPoint.y -= dy * Math.abs(dirY) * this.scale
            return
        }
        if (!this.activeBlock.CanResizeHorizontally(dx, dirX)) {
            this.prevPoint.x -= dx * Math.abs(dirX) * this.scale
            dx = 0
        }
        if (!this.activeBlock.CanResizeVertically(dy, dirY)) {
            this.prevPoint.y -= dy * Math.abs(dirY) * this.scale
            dy = 0
        }
        this.activeBlock.Resize(dx, dy, dirX, dirY)
        if (restoreArrows == null) {
            restoreArrows = this.RetraceArrows()
        } else {
            this.UpdateArrows(restoreArrows)
        }
        if (saveHistory) this.AddHistory(ACTION_RESIZE, {
            block: this.activeBlock,
            dx: dx,
            dy: dy,
            dirX: dirX,
            dirY: dirY,
            arrows: restoreArrows
        })
    }
    Diagram.prototype.MoveSelection = function(dx, dy, saveHistory = true) {
        for (let i = 0; i < this.currSelection.blocks.length; i++) this.currSelection.blocks[i].Move(dx, dy)
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            for (let j = 0; j < this.currSelection.blocks.length; j++) {
                if (this.arrows[i].IsConnectToBlock(this.currSelection.blocks[j])) {
                    let arrow = this.arrows[i].Copy()
                    this.RemoveArrow(this.arrows[i])
                    arrow.Retrace(this.blocks, this.arrows)
                    this.AddArrow(arrow, false)
                    break
                }
            }
        }
        this.currSelection.x1 += dx
        this.currSelection.x2 += dx
        this.currSelection.y1 += dy
        this.currSelection.y2 += dy
        if (saveHistory) this.AddHistory(ACTION_SELECT, {
            selection: this.currSelection,
            dx: dx,
            dy: dy
        })
    }
    Diagram.prototype.RemoveSelection = function(saveHistory = true) {
        let arrows = []
        let blocks = []
        for (let i = 0; i < this.currSelection.blocks.length; i++) {
            for (let j = 0; j < this.arrows.length; j++)
                if (this.arrows[j].IsConnectToBlock(this.currSelection.blocks[i]) && arrows.indexOf(this.arrows[j]) == -1) arrows.push(this.arrows[j])
            blocks.push(this.currSelection.blocks[i])
            let index = this.blocks.indexOf(this.currSelection.blocks[i])
            this.blocks.splice(index, 1)
        }
        for (let i = 0; i < arrows.length; i++) this.RemoveArrow(arrows[i])
        if (saveHistory) this.AddHistory(ACTION_SELECTION_REMOVE, {
            selection: this.currSelection,
            blocks: blocks,
            arrows: arrows
        })
        this.currSelection = null
    }
    Diagram.prototype.RemoveActiveBlock = function(saveHistory = true) {
        if (this.activeBlock == null) return
        let arrows = []
        let outputArrows = []
        let inputArrows = []
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            if (this.arrows[i].endBlock == this.activeBlock) inputArrows.push(this.arrows[i])
            if (this.arrows[i].startBlock == this.activeBlock) outputArrows.push(this.arrows[i])
            if (this.arrows[i].IsConnectToBlock(this.activeBlock)) {
                arrows.push(this.arrows[i])
                this.arrows.splice(i, 1)
            }
        }
        if (saveHistory) {
            this.AddHistory(ACTION_REMOVE_BLOCK, {
                block: this.activeBlock,
                arrows: arrows
            })
            if (outputArrows.length == 1 && outputArrows[0].endBlock != this.activeBlock) {
                for (let i = 0; i < inputArrows.length; i++) {
                    let arrow = new Arrow(inputArrows[i].startBlock, inputArrows[i].startConnector)
                    arrow.TraceTo(outputArrows[0].endBlock, outputArrows[0].endConnector, this.blocks, this.arrows)
                    this.AddArrow(arrow)
                }
            }
        }
        let index = this.blocks.indexOf(this.activeBlock)
        this.blocks.splice(index, 1)
        this.activeBlock = null
        this.action = ''
    }
    Diagram.prototype.RemoveArrow = function(arrow) {
        for (let i = 0; i < this.arrows.length; i++) {
            if (this.arrows[i].IsNearlyEqual(arrow)) {
                this.arrows.splice(i, 1)
                return
            }
        }
        throw "Unable to remove arrow"
    }
    Diagram.prototype.RemoveActivatedArrow = function(saveHistory = true) {
        if (this.activatedArrow == null) return
        if (saveHistory) this.AddHistory(ACTION_REMOVE_ARROW, {
            arrow: this.activatedArrow
        })
        this.RemoveArrow(this.activatedArrow)
        this.activatedArrow = null
    }
    Diagram.prototype.MakeAction = function(dx, dy) {
        if (this.action == ACTION_RESIZE) {
            let dirX = Math.sign(this.activeResizePoint.x)
            let dirY = Math.sign(this.activeResizePoint.y)
            this.ResizeActiveBlock(dx, dy, dirX, dirY)
        } else if (this.action == ACTION_MOVE) {
            this.MoveActiveBlock(dx, dy)
        } else if (this.action == ACTION_SELECT) {
            if (this.currSelection.blocks.length == 0) {
                this.currSelection.x2 += dx
                this.currSelection.y2 += dy
            } else {
                this.MoveSelection(dx, dy)
            }
        }
    }
    Diagram.prototype.BlocksPressedMouseMove = function() {
        if (this.isEdit) {
            this.activeBlock.SetEndSelection(this.currRealPoint.x, this.currRealPoint.y, this.ctx)
            return
        }
        let dx = (this.currPoint.x - this.prevPoint.x) / this.scale
        let dy = (this.currPoint.y - this.prevPoint.y) / this.scale
        if (Math.abs(dx) < GRID_SIZE && Math.abs(dy) < GRID_SIZE) return
        if (this.action == ACTION_RESIZE) {
            dx = Math.floor(dx / (GRID_SIZE * 2)) * GRID_SIZE * 2
            dy = Math.floor(dy / (GRID_SIZE * 2)) * GRID_SIZE * 2
        } else {
            dx = Math.floor(dx / GRID_SIZE) * GRID_SIZE
            dy = Math.floor(dy / GRID_SIZE) * GRID_SIZE
        }
        this.MakeAction(dx, dy)
        this.prevPoint.x += dx * this.scale
        this.prevPoint.y += dy * this.scale
    }
    Diagram.prototype.ConnectionsPressedMouseMove = function() {
        if (this.activatedArrow == null || this.activeSegment == null) return
        let dx = (this.currPoint.x - this.prevPoint.x) / this.scale
        let dy = (this.currPoint.y - this.prevPoint.y) / this.scale
        if (Math.abs(dx) < GRID_SIZE && Math.abs(dy) < GRID_SIZE) return
        dx = Math.floor(dx / GRID_SIZE) * GRID_SIZE
        dy = Math.floor(dy / GRID_SIZE) * GRID_SIZE
        this.activatedArrow.MoveSegment(this.activeSegment, dx, dy)
        this.prevPoint.x += dx * this.scale
        this.prevPoint.y += dy * this.scale
    }
    Diagram.prototype.UpdatePoints = function(e) {
        this.currPoint.x = e.offsetX
        this.currPoint.y = e.offsetY
        this.currRealPoint.x = Math.round((this.currPoint.x - this.x0) / this.scale)
        this.currRealPoint.y = Math.round((this.currPoint.y - this.y0) / this.scale)
    }
    Diagram.prototype.MakeMovement = function() {
        if (!this.isPressed) return
        let dx = this.currPoint.x - this.prevPoint.x
        let dy = this.currPoint.y - this.prevPoint.y
        this.x0 += dx
        this.y0 += dy
        this.prevPoint.x += dx
        this.prevPoint.y += dy
    }
    Diagram.prototype.MouseMove = function(e) {
        if (e.target.tagName != 'CANVAS') return
        this.isControlPressed = (e.ctrlKey || e.metaKey)
        this.UpdatePoints(e)
        if (this.isPressed && !this.IsMouseInSelection(this.currRealPoint.x, this.currRealPoint.y) && (e.ctrlKey || e.metaKey)) {
            this.MakeMovement()
            return
        }
        if (this.mode == BLOCK_MODE) {
            if (this.action == ACTION_CLICK) this.action = ACTION_MOVE
            if (this.isPressed) this.BlocksPressedMouseMove()
        } else if (this.mode == CONNECTION_MODE) {
            if (this.isPressed) this.ConnectionsPressedMouseMove()
        }
    }
    Diagram.prototype.InsertBlockById = function(index, x, y) {
        if (index < 0 || index >= BLOCK_TYPES.length) return
        if (this.IsMouseInMenu(x) || this.IsMouseInRightMenu(x, y) || this.IsMouseInKeyboardMenu(x, y)) return
        this.SwitchToMode(BLOCK_MODE)
        this.AddBlock(new Block((x - this.x0) / this.scale, (y - this.y0) / this.scale, "", BLOCK_WIDTHS[index], BLOCK_HEIGHTS[index], BLOCK_TYPES[index]))
    }
    Diagram.prototype.MakeArrow = function(block1, connector1, block2, connector2) {
        let arrow = new Arrow(block1, block1.connectors[connector1])
        arrow.TraceTo(block2, block2.connectors[connector2], this.blocks, this.arrows)
        return arrow
    }
    Diagram.prototype.InsertTemplateById = function(index, x, y) {
        if (this.IsMouseInMenu(x) || this.IsMouseInRightMenu(x, y) || this.IsMouseInKeyboardMenu(x, y)) return
        this.SwitchToMode(BLOCK_MODE)
        x = (x - this.x0) / this.scale
        y = (y - this.y0) / this.scale
        if (index == 0) {
            this.InsertForLoopTemplate(x, y)
        } else if (index == 1) {
            this.InsertWhileLoopTemplate(x, y)
        } else if (index == 2) {
            this.InsertForInForTemplate(x, y)
        } else if (index == 3) {
            this.InsertConditionTemplate(x, y)
        } else if (index == 4) {
            this.InsertSwitchTemplate(x, y)
        } else if (index == 5) {
            this.InsertProgramTemplate(x, y)
        }
    }
    Diagram.prototype.BlocksMenuAction = function() {
        let index = Math.floor((this.currPoint.y - BLOCKS_MENU_Y0 + BLOCKS_MENU_ITEM_PADDING) / (BLOCKS_MENU_BLOCK_HEIGHT + BLOCKS_MENU_DY))
        let x = MENU_WIDTH[this.isFullMenu] + INIT_BLOCK_X0 + BLOCK_WIDTHS[index] / 2 * this.scale
        this.InsertBlockById(index, x, this.currPoint.y)
        this.isPressed = true
        this.prevPoint = {
            x: x,
            y: this.currPoint.y
        }
        this.BlocksMouseDown((x - this.x0) / this.scale, this.currRealPoint.y)
    }
    Diagram.prototype.MenuMouseDown = function() {
        this.DisableEdit()
        this.activeBlock = null
        this.action = ''
        let y = this.currPoint.y
        if (y >= BLOCKS_MENU_Y0 - BLOCKS_MENU_ITEM_PADDING && y < BLOCKS_MENU_Y0 + BLOCK_TYPES.length * (BLOCKS_MENU_BLOCK_HEIGHT + BLOCKS_MENU_DY) - BLOCKS_MENU_DY / 2) {
            this.BlocksMenuAction()
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 || y > SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * MENU_ITEMS.length) return
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT) {
            this.Save()
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * 2) {
            this.Load()
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * 3) {
            this.SavePicture()
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * 4) {
            this.SaveAreas()
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * 5) {
            DARK_THEME = 1 - DARK_THEME
            return
        }
        if (y < SAVE_LOAD_MENU_Y0 + SAVE_LOAD_MENU_ITEM_HEIGHT * 6) {
            let link = document.createElement("a")
            link.target = "_blank"
            link.href = "https://programforyou.ru/poleznoe/how-to-use-our-block-diagram-redactor"
            link.click()
            return
        }
    }
    Diagram.prototype.BottomMenuMouseDown = function() {
        let x0 = BOTTOM_MENU_X0 < 0 ? this.width + BOTTOM_MENU_X0 : BOTTOM_MENU_X0
        let y0 = BOTTOM_MENU_Y0 < 0 ? this.height + BOTTOM_MENU_Y0 : BOTTOM_MENU_Y0
        if (this.currPoint.y < y0 || this.currPoint.y > y0 + BOTTOM_MENU_ICON_SIZE) return false
        if (this.currPoint.x > x0 - BOTTOM_MENU_ICON_SIZE && this.currPoint.x < x0) {
            if (this.activeBlock != null) {
                this.RemoveActiveBlock()
            } else if (this.activatedArrow != null) {
                this.RemoveActivatedArrow()
            } else if (this.activeArrow != null) {
                this.EscapeKeyDownProcess()
            } else if (this.currSelection != null) {
                this.RemoveSelection()
            }
            return true
        }
        if (this.currPoint.x < x0 || this.currPoint.x > x0 + this.bottomMenuIcons.length * BOTTOM_MENU_ICON_SIZE) return false
        if (this.action != '' || this.activeArrow != null) return
        let index = Math.floor((this.currPoint.x - x0) / BOTTOM_MENU_ICON_SIZE)
        if (index == 0) {
            this.Undo()
        } else if (index == 1) {
            this.Repeat()
        } else if (index == 2) {
            this.UpdateScale(-1, true)
        } else if (index == 3) {
            this.UpdateScale(1, true)
        } else if (index == 4) {
            this.needDrawGrid = !this.needDrawGrid
        }
        return true
    }
    Diagram.prototype.RightMenuMouseDown = function() {
        if (!this.IsMouseInRightMenu(this.currPoint.x, this.currPoint.y)) return false
        let index = Math.floor(this.currPoint.y / RIGHT_MENU_ICON_SIZE)
        let item = this.rightItems[index]
        if (item == 'edit') {
            if (!this.isEdit) {
                this.isEdit = true
                this.activeBlock.StartEdit()
            }
            this.canvas.blur()
            this.textInput.value = ''
            this.textInput.focus()
        } else if (item == 'bold') {
            this.ChangeFormatting(BOLD)
        } else if (item == 'italic') {
            this.ChangeFormatting(ITALIC)
        } else if (item == 'decrease-font') {
            this.ChangeFormatting(DECREASE_FONT)
        } else if (item == 'increase-font') {
            this.ChangeFormatting(INCREASE_FONT)
        } else if (item == 'left-align') {
            this.ChangeFormatting(LEFT_TEXT_ALIGN)
        } else if (item == 'center-align') {
            this.ChangeFormatting(CENTER_TEXT_ALIGN)
        } else if (item == 'change') {
            this.activeBlock.SwapLabelsOfText(false)
        }
        return true
    }
    Diagram.prototype.KeyboardMenuMouseDown = function() {
        if (!this.IsMouseInKeyboardMenu(this.currPoint.x, this.currPoint.y)) return false
        let key = KEYBOARD_CHARACTERS[this.GetKeyboardMenuKeyPosition().index]
        if (this.shiftKey) key = key.toUpperCase()
        this.KeyPress({
            key: key,
            preventDefault: function() {}
        })
        return true
    }
    Diagram.prototype.IsMouseInSelection = function(x, y) {
        if (this.currSelection == null) return false
        if (x < this.currSelection.x1 || x > this.currSelection.x2) return false
        if (y < this.currSelection.y1 || y > this.currSelection.y2) return false
        return true
    }
    Diagram.prototype.BlocksMouseDown = function(x, y) {
        let res = this.GetBlockAndResizePointByPoint(x, y)
        if (this.isEdit && res.block == this.activeBlock && res.point == null) {
            this.activeBlock.SetCursor(x, y, this.ctx)
            this.activeBlock.SetStartSelection(x, y, this.ctx)
            return
        }
        this.DisableEdit()
        this.activeBlock = res.block
        this.activeResizePoint = res.point
        this.action = ACTION_SELECT
        if (res.block != null) {
            this.action = res.point != null ? ACTION_RESIZE : ACTION_CLICK
            this.currSelection = null
        } else if (!this.IsMouseInSelection(x, y)) {
            this.currSelection = {
                x1: x,
                y1: y,
                x2: x,
                y2: y,
                blocks: []
            }
        }
    }
    Diagram.prototype.ActivateArrowAtPoint = function(x, y, addPoint = false) {
        if (this.activatedArrow == null || !this.activatedArrow.IsMouseHover(x, y)) this.activatedArrow = this.GetArrowByPoint(x, y)
        if (this.activatedArrow != null) {
            this.activatedArrow.SetActivated(true)
            this.activeSegment = this.activatedArrow.GetMoveSegment(x, y)
            if (addPoint && (this.activeSegment == null || !this.activeSegment.real)) {
                this.SavePrevArrow()
                this.activatedArrow.AddPoint(x, y)
                this.activeSegment = null
                this.AddHistory(ACTION_CHANGE_ARROW, {
                    prevArrow: this.prevArrow,
                    currArrow: this.activatedArrow
                })
            } else if (this.activeSegment != null) {
                this.SavePrevArrow()
                this.action = ACTION_CHANGE_ARROW
            }
        }
    }
    Diagram.prototype.AlreadyHaveConnection = function(arrow) {
        for (let i = 0; i < this.arrows.length; i++)
            if (this.arrows[i].IsNearlyEqual(arrow)) return true
        return false
    }
    Diagram.prototype.EndArrowAdd = function(res) {
        if (res.connector == this.activeArrow.startConnector) return
        this.activeArrow.TraceTo(res.block, res.connector, this.blocks, this.arrows)
        this.AddArrow(this.activeArrow, this.action != ACTION_CHANGE_ARROW)
        if (this.action == ACTION_CHANGE_ARROW) this.AddHistory(ACTION_CHANGE_ARROW, {
            prevArrow: this.prevArrow,
            currArrow: this.activeArrow
        })
        this.activatedArrow = this.activeArrow
        this.activeArrow = null
        this.action = ''
    }
    Diagram.prototype.ConnectionsMouseDownWithActiveArrow = function(res, x, y) {
        if (res.connector != null) {
            this.EndArrowAdd(res)
            return
        }
        let block = this.GetBlockByPoint(x, y)
        if (block != null) {
            this.EndArrowAdd({
                block: block,
                connector: block.GetNearsetConnector(x, y)
            })
            return
        }
        let arrow = this.GetArrowByPoint(x, y)
        if (arrow != null) {
            this.EndArrowAdd({
                block: arrow.endBlock,
                connector: arrow.endConnector
            })
            return
        }
        this.activeArrow.AddNode(x, y)
        this.activeArrow.OptimizeNodes(false)
    }
    Diagram.prototype.ConnectionsMouseDown = function(x, y, ctrlKey) {
        let res = this.GetBlockAndConnectorByPoint(x, y)
        this.ClearArrowsActivation()
        if (this.activeArrow == null) {
            if (res.connector == null) {
                this.ActivateArrowAtPoint(x, y, ctrlKey)
                return
            }
            if (this.activatedArrow == null || res.connector != this.activatedArrow.endConnector) {
                if (res.block.IsText()) return
                this.activeArrow = new Arrow(res.block, res.connector)
                this.activeArrow.SetActivated(true)
            } else {
                this.action = ACTION_CHANGE_ARROW
                this.activatedArrow.SetActivated(true)
                this.prevArrow = this.activatedArrow.Copy()
                this.RemoveArrow(this.activatedArrow)
                this.activeArrow = this.activatedArrow.Copy()
                this.activeArrow.InitStart()
            }
        } else {
            this.ConnectionsMouseDownWithActiveArrow(res, x, y)
        }
    }
    Diagram.prototype.AutoChangeModeOnDown = function(x, y, ctrlKey) {
        if (this.activeArrow != null) return false
        if (this.mode == CONNECTION_MODE) {
            if (this.GetArrowByPoint(x, y) != null) return false
            for (let i = this.blocks.length - 1; i >= 0; i--) {
                if (this.blocks[i].GetResizePoint(x, y) != null) break
                if (this.blocks[i].GetConnector(x, y) != null) return false
                if (this.activatedArrow != null && this.activatedArrow.GetMoveSegment(x, y) != null) return false
                if (this.blocks[i].IsMouseHover(x, y)) break
            }
            this.SwitchToMode(BLOCK_MODE)
            this.BlocksMouseDown(x, y)
            return true
        }
        if (this.mode == BLOCK_MODE) {
            if (this.GetBlockAndResizePointByPoint(x, y).point != null) return false
            if (this.GetBlockByPoint(x, y) != null) return false
            if (this.GetArrowByPoint(x, y) != null) {
                this.SwitchToMode(CONNECTION_MODE)
                this.ConnectionsMouseDown(x, y, ctrlKey)
                return true
            }
            if (this.GetBlockAndConnectorByPoint(x, y).connector != null) {
                this.SwitchToMode(CONNECTION_MODE)
                this.ConnectionsMouseDown(x, y, ctrlKey)
                return true
            }
        }
        return false
    }
    Diagram.prototype.MouseDown = function(e) {
        if (e.target.tagName != 'CANVAS' || this.isPressed) return
        this.needTips = false
        this.UpdatePoints(e)
        if (this.currPoint.x < MENU_WIDTH[this.isFullMenu]) {
            this.MenuMouseDown()
            return
        }
        if (this.BottomMenuMouseDown()) return
        if (this.RightMenuMouseDown()) return
        if (this.KeyboardMenuMouseDown()) return
        if (e.detail == 2 && this.activeBlock != null) {
            if (this.activeBlock.IsMouseHover(this.currRealPoint.x, this.currRealPoint.y)) {
                this.isEdit = true
                this.activeBlock.StartEdit()
                return
            } else {
                this.activeBlock = null
            }
        }
        this.isPressed = true
        this.isControlPressed = (e.ctrlKey || e.metaKey)
        this.prevPoint = {
            x: this.currPoint.x,
            y: this.currPoint.y
        }
        if (e.button != 0) return
        if (this.AutoChangeModeOnDown(this.currRealPoint.x, this.currRealPoint.y, (e.ctrlKey || e.metaKey))) {
            this.isPressed = true
            return
        }
        if (this.mode == BLOCK_MODE && (!(e.ctrlKey || e.metaKey) || this.IsMouseInSelection(this.currRealPoint.x, this.currRealPoint.y))) {
            this.BlocksMouseDown(this.currRealPoint.x, this.currRealPoint.y)
        } else if (this.mode == CONNECTION_MODE) {
            this.ConnectionsMouseDown(this.currRealPoint.x, this.currRealPoint.y, (e.ctrlKey || e.metaKey))
        }
    }
    Diagram.prototype.SavePrevArrow = function() {
        if (this.activatedArrow == null) return
        this.prevArrow = this.activatedArrow.Copy()
        this.RemoveArrow(this.activatedArrow)
        this.activatedArrow = this.prevArrow.Copy()
        this.AddArrow(this.activatedArrow, false)
    }
    Diagram.prototype.InsertBlockToArrow = function() {
        if (this.activeBlock == null || this.activeBlock.type == TEXT_TYPE || this.HasBlockConnections(this.activeBlock)) return
        let result = this.GetArrowAndVerticalSegmentByPoint(this.activeBlock.x, this.activeBlock.y)
        if (result == null) return
        this.RemoveArrow(result.arrow)
        let connector1 = result.segment.dy > 0 ? TOP_CONNECTOR : BOTTOM_CONNECTOR
        let connector2 = result.segment.dy > 0 ? BOTTOM_CONNECTOR : TOP_CONNECTOR
        if (this.activeBlock.type == CONDITION_TYPE) {
            connector1 = TOP_CONNECTOR
            connector2 = LEFT_CONNECTOR
        }
        let arrow1 = new Arrow(result.arrow.startBlock, result.arrow.startConnector)
        arrow1.TraceTo(this.activeBlock, this.activeBlock.connectors[connector1], this.blocks, this.arrows)
        this.AddArrow(arrow1, false)
        let arrow2 = new Arrow(this.activeBlock, this.activeBlock.connectors[connector2])
        arrow2.TraceTo(result.arrow.endBlock, result.arrow.endConnector, this.blocks, this.arrows)
        this.AddArrow(arrow2, false)
        this.AddHistory(ACTION_INSERT_BLOCK, {
            arrow: result.arrow,
            arrow1: arrow1,
            arrow2: arrow2
        })
    }
    Diagram.prototype.ConnectBlockToBlock = function() {
        if (this.activeBlock == null || this.activeBlock.type == TEXT_TYPE) return
        let result = this.GetBlockAndConnectorByBlock()
        if (result == null) return
        let arrow = new Arrow(result.block, result.connector1)
        arrow.TraceTo(this.activeBlock, result.connector2, this.blocks, this.arrows)
        this.AddArrow(arrow)
    }
    Diagram.prototype.MakeSelection = function() {
        if (this.currSelection == null || this.currSelection.blocks.length != 0) return
        let x = Math.min(this.currSelection.x1, this.currSelection.x2)
        let y = Math.min(this.currSelection.y1, this.currSelection.y2)
        let w = Math.abs(this.currSelection.x1 - this.currSelection.x2)
        let h = Math.abs(this.currSelection.y1 - this.currSelection.y2)
        if (w < GRID_SIZE * 2 || h < GRID_SIZE * 2) {
            this.currSelection = null
            return
        }
        this.currSelection.x1 = x + w
        this.currSelection.x2 = x
        this.currSelection.y1 = y + h
        this.currSelection.y2 = y
        for (let i = 0; i < this.blocks.length; i++) {
            if (x > this.blocks[i].right || x + w < this.blocks[i].left) continue
            if (y > this.blocks[i].bottom || y + h < this.blocks[i].top) continue
            this.currSelection.blocks.push(this.blocks[i])
            this.currSelection.x1 = Math.min(this.currSelection.x1, this.blocks[i].left)
            this.currSelection.x2 = Math.max(this.currSelection.x2, this.blocks[i].right)
            this.currSelection.y1 = Math.min(this.currSelection.y1, this.blocks[i].top)
            this.currSelection.y2 = Math.max(this.currSelection.y2, this.blocks[i].bottom)
        }
        for (let i = 0; i < this.arrows.length; i++) {
            let index1 = this.currSelection.blocks.indexOf(this.arrows[i].startBlock)
            let index2 = this.currSelection.blocks.indexOf(this.arrows[i].endBlock)
            if (index1 == -1 || index2 == -1) continue
            let bbox = this.arrows[i].GetBBox()
            this.currSelection.x1 = Math.min(this.currSelection.x1, bbox.x1)
            this.currSelection.x2 = Math.max(this.currSelection.x2, bbox.x2)
            this.currSelection.y1 = Math.min(this.currSelection.y1, bbox.y1)
            this.currSelection.y2 = Math.max(this.currSelection.y2, bbox.y2)
        }
        this.currSelection.x1 -= GRID_SIZE * 2
        this.currSelection.x2 += GRID_SIZE * 2
        this.currSelection.y1 -= GRID_SIZE * 2
        this.currSelection.y2 += GRID_SIZE * 2
        if (this.currSelection.blocks.length == 0) this.currSelection = null
    }
    Diagram.prototype.BlocksMouseUp = function() {
        if (this.action == ACTION_RESIZE) {
            this.action = ''
        } else if (this.action == ACTION_MOVE) {
            this.InsertBlockToArrow()
            this.ConnectBlockToBlock()
        } else if (this.action == ACTION_SELECT) {
            this.MakeSelection()
        }
        this.action = ''
    }
    Diagram.prototype.ConnectionsMouseUp = function() {
        if (this.activatedArrow == null) return
        if (this.activeSegment != null) {
            this.activatedArrow.OptimizeNodes()
            if (!this.prevArrow.IsEqual(this.activatedArrow)) this.AddHistory(ACTION_CHANGE_ARROW, {
                prevArrow: this.prevArrow,
                currArrow: this.activatedArrow
            })
            this.activeSegment = null
            this.action = ''
        }
    }
    Diagram.prototype.MouseUp = function(e) {
        this.isPressed = false
        this.isControlPressed = (e.ctrlKey || e.metaKey)
        if (this.mode == BLOCK_MODE) {
            this.BlocksMouseUp()
        } else if (this.mode == CONNECTION_MODE) {
            this.ConnectionsMouseUp()
        }
    }
    Diagram.prototype.Undo = function() {
        if (this.history.length == 0) return
        this.SwitchToMode(this.mode)
        let movement = this.history.pop()
        if (movement.action == ACTION_MOVE) {
            this.activeBlock = movement.args.block
            this.MoveActiveBlock(-movement.args.dx, -movement.args.dy, false, movement.args.arrows)
        } else if (movement.action == ACTION_RESIZE) {
            this.activeBlock = movement.args.block
            this.ResizeActiveBlock(-movement.args.dx, -movement.args.dy, movement.args.dirX, movement.args.dirY, false, movement.args.arrows)
        } else if (movement.action == ACTION_REMOVE_ARROW) {
            this.SwitchToMode(CONNECTION_MODE)
            this.AddArrow(movement.args.arrow, false)
            this.activatedArrow = movement.args.arrow
        } else if (movement.action == ACTION_ADD_ARROW) {
            this.RemoveArrow(movement.args.arrow)
        } else if (movement.action == ACTION_CHANGE_ARROW) {
            this.SwitchToMode(CONNECTION_MODE)
            this.RemoveArrow(movement.args.currArrow)
            this.AddArrow(movement.args.prevArrow, false)
            this.activatedArrow = movement.args.prevArrow
            this.activatedArrow.SetActivated(true)
        } else if (movement.action == ACTION_ADD_BLOCK) {
            let index = this.blocks.indexOf(movement.args.block)
            this.blocks.splice(index, 1)
        } else if (movement.action == ACTION_REMOVE_BLOCK) {
            for (let i = 0; i < movement.args.arrows.length; i++) this.AddArrow(movement.args.arrows[i], false)
            this.blocks.push(movement.args.block)
            this.activeBlock = movement.args.block
        } else if (movement.action == ACTION_INSERT_BLOCK) {
            this.RemoveArrow(movement.args.arrow1)
            this.RemoveArrow(movement.args.arrow2)
            this.AddArrow(movement.args.arrow, false)
        } else if (movement.action == ACTION_EDIT_BLOCK || movement.action == ACTION_CUT_TEXT || movement.action == ACTION_PASTE_TEXT) {
            this.activeBlock = movement.args.block
            this.activeBlock.SetText(movement.args.prevText)
            this.activeBlock.y = movement.args.y
            this.activeBlock.height = movement.args.height
            this.activeBlock.FixSizesByText(this.ctx)
            this.UpdateArrows(movement.args.arrows)
        } else if (movement.action == ACTION_CHANGE_FORMATTING) {
            this.activeBlock = movement.args.block
            this.activeBlock.isBold = movement.args.prevBold
            this.activeBlock.isItalic = movement.args.prevItalic
        } else if (movement.action == ACTION_CHANGE_FONT) {
            this.activeBlock = movement.args.block
            this.activeBlock.fontSize = movement.args.prevSize
            this.activeBlock.textHeight = movement.args.prevSize
            this.activeBlock.y = movement.args.y
            this.activeBlock.height = movement.args.height
            this.activeBlock.FixSizesByText(this.ctx)
            this.UpdateArrows(movement.args.arrows)
        } else if (movement.action == ACTION_CHANGE_ALIGNMENT) {
            this.activeBlock = movement.args.block
            this.activeBlock.textAlign = movement.args.prevTextAlign
        } else if (movement.action == ACTION_SELECT) {
            this.currSelection = movement.args.selection
            this.MoveSelection(-movement.args.dx, -movement.args.dy, false)
        } else if (movement.action == ACTION_SELECTION_REMOVE) {
            this.currSelection = movement.args.selection
            for (let i = 0; i < movement.args.blocks.length; i++) this.blocks.push(movement.args.blocks[i])
            for (let i = 0; i < movement.args.arrows.length; i++) this.AddArrow(movement.args.arrows[i], false)
        } else if (movement.action == ACTION_SELECTION_COPY) {
            for (let i = 0; i < movement.args.blocks.length; i++) this.blocks.splice(this.blocks.indexOf(movement.args.blocks[i]), 1)
            for (let i = 0; i < movement.args.arrows.length; i++) this.RemoveArrow(movement.args.arrows[i])
        } else if (movement.action == ACTION_CHANGE_TYPE) {
            this.activeBlock = movement.args.block
            this.activeBlock.ChangeType(movement.args.prev_type)
        }
        this.antiHistory.push(movement)
    }
    Diagram.prototype.Repeat = function() {
        if (this.antiHistory.length == 0) return
        this.SwitchToMode(this.mode)
        let movement = this.antiHistory.pop()
        if (movement.action == ACTION_MOVE) {
            this.SwitchToMode(BLOCK_MODE)
            this.activeBlock = movement.args.block
            this.MoveActiveBlock(movement.args.dx, movement.args.dy, false)
        } else if (movement.action == ACTION_RESIZE) {
            this.SwitchToMode(BLOCK_MODE)
            this.activeBlock = movement.args.block
            this.ResizeActiveBlock(movement.args.dx, movement.args.dy, movement.args.dirX, movement.args.dirY, false)
        } else if (movement.action == ACTION_REMOVE_ARROW) {
            this.activatedArrow = movement.args.arrow
            this.activatedArrow.SetActivated(true)
            this.RemoveActivatedArrow(false)
        } else if (movement.action == ACTION_ADD_ARROW) {
            this.SwitchToMode(CONNECTION_MODE)
            this.AddArrow(movement.args.arrow, false)
            this.activatedArrow = movement.args.arrow
            this.activatedArrow.SetActivated(true)
        } else if (movement.action == ACTION_CHANGE_ARROW) {
            this.RemoveArrow(movement.args.prevArrow)
            this.activatedArrow = movement.args.currArrow.Copy()
            this.AddArrow(this.activatedArrow, false)
            this.activatedArrow.SetActivated(true)
        } else if (movement.action == ACTION_ADD_BLOCK) {
            this.AddBlock(movement.args.block, false)
            this.activeBlock = movement.args.block
        } else if (movement.action == ACTION_REMOVE_BLOCK) {
            this.SwitchToMode(BLOCK_MODE)
            this.activeBlock = movement.args.block
            this.RemoveActiveBlock(false)
        } else if (movement.action == ACTION_INSERT_BLOCK) {
            this.AddArrow(movement.args.arrow1, false)
            this.AddArrow(movement.args.arrow2, false)
            this.RemoveArrow(movement.args.arrow)
        } else if (movement.action == ACTION_EDIT_BLOCK || movement.action == ACTION_CUT_TEXT || movement.action == ACTION_PASTE_TEXT) {
            this.activeBlock = movement.args.block
            this.activeBlock.SetText(movement.args.currText)
            this.activeBlock.FixSizesByText(this.ctx)
            this.RetraceArrows()
        } else if (movement.action == ACTION_CHANGE_FORMATTING) {
            this.activeBlock = movement.args.block
            this.activeBlock.isBold = movement.args.bold
            this.activeBlock.isItalic = movement.args.italic
        } else if (movement.action == ACTION_CHANGE_FONT) {
            this.activeBlock = movement.args.block
            this.activeBlock.fontSize = movement.args.size
            this.activeBlock.textHeight = movement.args.size
            this.activeBlock.FixSizesByText(this.ctx)
            this.RetraceArrows()
        } else if (movement.action == ACTION_CHANGE_ALIGNMENT) {
            this.activeBlock = movement.args.block
            this.activeBlock.textAlign = movement.args.textAlign
        } else if (movement.action == ACTION_SELECT) {
            this.currSelection = movement.args.selection
            this.MoveSelection(movement.args.dx, movement.args.dy, false)
        } else if (movement.action == ACTION_SELECTION_REMOVE) {
            this.currSelection = movement.args.selection
            this.RemoveSelection(false)
        } else if (movement.action == ACTION_SELECTION_COPY) {
            for (let i = 0; i < movement.args.blocks.length; i++) this.blocks.push(movement.args.blocks[i])
            for (let i = 0; i < movement.args.arrows.length; i++) this.AddArrow(movement.args.arrows[i], false)
            this.currSelection = movement.args.selection
        } else if (movement.action == ACTION_CHANGE_TYPE) {
            this.activeBlock = movement.args.block
            this.activeBlock.ChangeType(movement.args.new_type)
        }
        this.history.push(movement)
    }
    Diagram.prototype.CopySelection = function() {
        let x1 = this.currSelection.x1
        let y1 = this.currSelection.y1
        let x2 = this.currSelection.x2
        let y2 = this.currSelection.y2
        let selection = {
            blocks: [],
            arrows: [],
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        }
        let realBlocks = []
        for (let i = 0; i < this.currSelection.blocks.length; i++) {
            realBlocks.push(this.currSelection.blocks[i])
            selection.blocks.push(this.currSelection.blocks[i].Copy())
        }
        for (let i = 0; i < this.arrows.length; i++) {
            let index1 = realBlocks.indexOf(this.arrows[i].startBlock)
            let index2 = realBlocks.indexOf(this.arrows[i].endBlock)
            if (index1 == -1 || index2 == -1) continue
            let connectorIndex1 = realBlocks[index1].connectors.indexOf(this.arrows[i].startConnector)
            let connectorIndex2 = realBlocks[index2].connectors.indexOf(this.arrows[i].endConnector)
            let arrow = this.arrows[i].Copy()
            arrow.startBlock = selection.blocks[index1]
            arrow.startConnector = selection.blocks[index1].connectors[connectorIndex1]
            arrow.endBlock = selection.blocks[index2]
            arrow.endConnector = selection.blocks[index2].connectors[connectorIndex2]
            selection.arrows.push(arrow)
        }
        return selection
    }
    Diagram.prototype.PasteSelection = function(selection, x, y, saveHistory = true) {
        let dx = Math.floor((x - (selection.x1 + selection.x2) / 2) / GRID_SIZE) * GRID_SIZE
        let dy = Math.floor((y - (selection.y1 + selection.y2) / 2) / GRID_SIZE) * GRID_SIZE
        let newBlocks = []
        let newArrows = []
        for (let i = 0; i < selection.blocks.length; i++) newBlocks.push(selection.blocks[i].Copy())
        for (let i = 0; i < selection.arrows.length; i++) {
            let index1 = selection.blocks.indexOf(selection.arrows[i].startBlock)
            let index2 = selection.blocks.indexOf(selection.arrows[i].endBlock)
            let connectorIndex1 = selection.blocks[index1].connectors.indexOf(selection.arrows[i].startConnector)
            let connectorIndex2 = selection.blocks[index2].connectors.indexOf(selection.arrows[i].endConnector)
            let arrow = selection.arrows[i].Copy()
            arrow.startBlock = newBlocks[index1]
            arrow.startConnector = newBlocks[index1].connectors[connectorIndex1]
            arrow.endBlock = newBlocks[index2]
            arrow.endConnector = newBlocks[index2].connectors[connectorIndex2]
            arrow.Move(dx, dy)
            newArrows.push(arrow)
        }
        for (let i = 0; i < newBlocks.length; i++) newBlocks[i].Move(dx, dy)
        this.currSelection = {
            x1: selection.x1 + dx,
            y1: selection.y1 + dy,
            x2: selection.x2 + dx,
            y2: selection.y2 + dy,
            blocks: newBlocks
        }
        this.blocks = this.blocks.concat(newBlocks)
        this.arrows = this.arrows.concat(newArrows)
        if (saveHistory) this.AddHistory(ACTION_SELECTION_COPY, {
            blocks: newBlocks,
            arrows: newArrows,
            selection: this.currSelection
        })
    }
    Diagram.prototype.Copy = function() {
        if (this.activeBlock != null) {
            this.copyBuffer = {
                type: 'block',
                block: this.activeBlock.Copy()
            }
            return
        }
        if (this.currSelection != null) this.copyBuffer = {
            type: 'selection',
            selection: this.CopySelection()
        }
    }
    Diagram.prototype.Paste = function() {
        if (this.copyBuffer == null) return false
        if (this.copyBuffer.type == 'block') {
            let x = (Math.max(this.currPoint.x, MENU_WIDTH[this.isFullMenu] + this.copyBuffer.block.width / 2) - this.x0) / this.scale
            let y = this.currRealPoint.y
            this.AddBlock(this.copyBuffer.block.Copy(x, y))
            return true
        }
        if (this.copyBuffer.type == 'selection') {
            let x = this.currRealPoint.x
            let y = this.currRealPoint.y
            this.PasteSelection(this.copyBuffer.selection, x, y)
            return true
        }
        return false
    }
    Diagram.prototype.PasteText = function(e) {
        let text = e.clipboardData.getData('text/plain')
        if (text == "") return
        if (this.activeBlock == null) {
            let id = BLOCK_TYPES.indexOf(TEXT_TYPE)
            this.InsertBlockById(id, this.currPoint.x, this.currPoint.y)
            this.activeBlock.SetText('')
        }
        let prevText = this.activeBlock.GetText()
        let y = this.activeBlock.y
        let height = this.activeBlock.height
        this.activeBlock.InsertText(text, this.ctx)
        let arrows = this.RetraceArrows()
        this.AddHistory(ACTION_PASTE_TEXT, {
            block: this.activeBlock,
            prevText: prevText,
            currText: this.activeBlock.GetText(),
            y: y,
            height: height,
            arrows: arrows
        })
    }
    Diagram.prototype.CopyText = function(e) {
        e.clipboardData.setData('text/plain', this.activeBlock.GetSelectedText())
        e.preventDefault()
        this.copyBuffer = null
    }
    Diagram.prototype.CutText = function(e) {
        if (!this.isEdit || !this.activeBlock.field.HaveSelection()) return
        let selectedText = this.activeBlock.GetSelectedText()
        let prevText = this.activeBlock.GetText()
        e.clipboardData.setData('text/plain', selectedText)
        e.preventDefault()
        this.activeBlock.field.RemoveSelection()
        let arrows = this.RetraceArrows()
        this.AddHistory(ACTION_CUT_TEXT, {
            block: this.activeBlock,
            prevText: prevText,
            currText: this.activeBlock.GetText(),
            y: this.activeBlock.y,
            height: this.activeBlock.height,
            arrows: arrows
        })
    }
    Diagram.prototype.SelectAll = function() {
        if (this.blocks.length == 0) return
        this.EscapeKeyDownProcess()
        let xmin = this.blocks[0].left
        let xmax = this.blocks[0].right
        let ymin = this.blocks[0].top
        let ymax = this.blocks[0].bottom
        let blocks = []
        for (let i = 0; i < this.blocks.length; i++) {
            xmin = Math.min(xmin, this.blocks[i].left)
            xmax = Math.max(xmax, this.blocks[i].right)
            ymin = Math.min(ymin, this.blocks[i].top)
            ymax = Math.max(ymax, this.blocks[i].bottom)
            blocks.push(this.blocks[i])
        }
        this.currSelection = {
            x1: xmin - 2 * GRID_SIZE,
            y1: ymin - 2 * GRID_SIZE,
            x2: xmax + 2 * GRID_SIZE,
            y2: ymax + 2 * GRID_SIZE,
            blocks: blocks
        }
    }
    Diagram.prototype.BlocksToJSON = function() {
        let json = []
        for (let i = 0; i < this.blocks.length; i++) json.push(this.blocks[i].ToJSON())
        return json
    }
    Diagram.prototype.ArrowsToJSON = function() {
        let json = []
        for (let i = 0; i < this.arrows.length; i++) json.push(this.arrows[i].ToJSON(this.blocks))
        return json
    }
    Diagram.prototype.MakeJSON = function() {
        let diagram = {
            blocks: this.BlocksToJSON(),
            arrows: this.ArrowsToJSON(),
            x0: this.x0,
            y0: this.y0
        }
        return JSON.stringify(diagram)
    }
    Diagram.prototype.IndexOfBlock = function(block) {
        for (let i = 0; i < this.blocks.length; i++)
            if (this.blocks[i].IsEqual(block)) return i
        throw "Invalid block index"
    }
    Diagram.prototype.ReadFile = function(input) {
        let diagram = this
        let fr = new FileReader();
        let file = input.files[0]
        if (input == this.input) {
            fr.onload = function(e) {
                diagram.Restore(e.target.result)
            };
        } else {
            fr.onload = function(e) {
                diagram.Generate(e.target.result, file.name)
            };
        }
        let reader = new FileReader()
        reader.onload = function(e) {
            let encoding = e.target.result.indexOf('�') > -1 ? 'cp1251' : 'utf-8'
            fr.readAsText(file, encoding)
        }
        reader.readAsText(file)
        input.value = null
    }
    Diagram.prototype.Load = function() {
        this.isPressed = false
        if (!confirm("Вы уверены? Текущая блок-схема будет утеряна")) return
        this.input.click()
    }
    Diagram.prototype.RestoreBlocks = function(blocks) {
        for (let i = 0; i < blocks.length; i++) {
            let x = blocks[i].x
            let y = blocks[i].y
            let text = blocks[i].text
            let width = blocks[i].width
            let height = blocks[i].height
            let type = blocks[i].type
            let isMenuBlock = blocks[i].isMenuBlock
            if (type == "Текст") type = TEXT_TYPE
            let block = new Block(x, y, text, width, height, type, isMenuBlock)
            block.fontSize = blocks[i].fontSize
            block.textHeight = blocks[i].textHeight
            block.isBold = blocks[i].isBold
            block.isItalic = blocks[i].isItalic
            block.textAlign = blocks[i].textAlign || CENTER_TEXT_ALIGN
            if (type == CONDITION_TYPE) block.labelsPosition = blocks[i].labelsPosition
            this.AddBlock(block)
        }
    }
    Diagram.prototype.RestoreArrows = function(arrows) {
        for (let i = 0; i < arrows.length; i++) {
            let startBlock = this.blocks[arrows[i].startIndex]
            let startConnector = startBlock.connectors[arrows[i].startConnectorIndex]
            let endBlock = this.blocks[arrows[i].endIndex]
            let endConnector = endBlock.connectors[arrows[i].endConnectorIndex]
            let arrow = new Arrow(startBlock, startConnector)
            arrow.Restore(arrows[i], endBlock, endConnector)
            this.AddArrow(arrow)
        }
    }
    Diagram.prototype.Restore = function(encoded) {
        let currDiagram = this.MakeJSON()
        try {
            let decoded = JSON.parse(encoded)
            this.x0 = decoded.x0 | 0
            this.y0 = decoded.y0 | 0
            this.Init()
            this.RestoreBlocks(decoded.blocks)
            this.RestoreArrows(decoded.arrows)
            this.JumpToNearest()
        } catch (error) {
            console.log(error)
            this.Restore(currDiagram)
            alert("Загруженный файл некорректен, восстановлена прошлая диаграмма")
        }
    }
    Diagram.prototype.UploadForGenerate = function() {
        this.isPressed = false
        if (!confirm("Вы уверены? Текущая блок-схема будет утеряна")) return
        this.sourceInput.click()
    }
    Diagram.prototype.GetLines = function(text) {
        let lines = text.replace(/\r/gi, '').split('\n')
        return lines.filter(function(s) {
            return !s.match(/^\s*$/)
        })
    }
    Diagram.prototype.Generate = function(text, filename) {
        if (text.trim() == '') {
            alert("Файл пуст")
            return
        }
        this.Init()
        let paths = filename.split('.')
        let extension = paths.pop()
        this.name = paths.join(".")
        let x = Math.floor(this.width / 2 / GRID_SIZE) * GRID_SIZE - this.x0
        let y = GRID_SIZE - this.y0
        let lines = this.GetLines(text)
        for (let i = 0; i < lines.length; i++) {
            let block = new Block(x, y, lines[i].trim(), 100, 40, BLOCK_TYPE)
            this.AddBlock(block)
            block.FixWidthByText(this.ctx)
            y += block.height + 2 * GRID_SIZE
        }
    }
    Diagram.prototype.JumpToNearest = function() {
        if (this.blocks.length == 0 || this.activeArrow != null || this.activeSegment != null || this.isPressed) return
        let minDst = 0
        let imin = -1
        let x = Math.round((this.width / 2 - this.x0) / this.scale)
        let y = Math.round((this.height / 2 - this.y0) / this.scale)
        for (let i = 0; i < this.blocks.length; i++) {
            let dst = Math.abs(this.blocks[i].x - x) + Math.abs(this.blocks[i].y - y)
            if (imin == -1 || dst < minDst) {
                minDst = dst
                imin = i
            }
        }
        this.SwitchToMode(BLOCK_MODE)
        this.currBlockIndex = imin
        this.x0 = this.width / 2 - this.blocks[this.currBlockIndex].x * this.scale
        this.y0 = this.height / 2 - this.blocks[this.currBlockIndex].y * this.scale
        this.activeBlock = this.blocks[this.currBlockIndex]
    }
    Diagram.prototype.JumpToNextBlock = function(isPrev) {
        if (this.activeArrow != null || this.activeSegment != null || this.isPressed) return
        this.SwitchToMode(BLOCK_MODE)
        this.currBlockIndex = (this.currBlockIndex + (isPrev ? -1 : 1) + this.blocks.length) % this.blocks.length
        this.x0 = this.width / 2 - this.blocks[this.currBlockIndex].x * this.scale
        this.y0 = this.height / 2 - this.blocks[this.currBlockIndex].y * this.scale
        this.activeBlock = this.blocks[this.currBlockIndex]
    }
    Diagram.prototype.UpdateScale = function(step, toCenter = false) {
        if (this.scaleIndex + step < 0 || this.scaleIndex + step >= this.scales.length) return
        let x = this.currPoint.x
        let y = this.currPoint.y
        if (x < 0 || y < 0 || x >= this.width || y >= this.height || toCenter) {
            x = this.width / 2
            y = this.height / 2
        }
        let dw = (x - this.x0) / this.scale
        let dh = (y - this.y0) / this.scale
        this.scaleIndex += step
        let index = 0
        let scale = Math.pow(this.scales[this.scaleIndex] / this.scale, 1 / SCALE_TRANSITION_ITERATIONS)
        let diagram = this
        if (this.interval) clearInterval(this.interval)
        this.interval = setInterval(function() {
            diagram.scale = index < SCALE_TRANSITION_ITERATIONS ? diagram.scale * scale : diagram.scales[diagram.scaleIndex]
            diagram.x0 = x - dw * diagram.scale
            diagram.y0 = y - dh * diagram.scale
            index++
            if (index > SCALE_TRANSITION_ITERATIONS) clearInterval(diagram.interval)
        }, SCALE_TRANSITION_PERIOD)
    }
    Diagram.prototype.GetArrowsDirection = function(key) {
        let dx = 0
        let dy = 0
        if (key == 'ArrowLeft') {
            dx = -GRID_SIZE
        } else if (key == 'ArrowRight') {
            dx = GRID_SIZE
        } else if (key == 'ArrowUp') {
            dy = -GRID_SIZE
        } else if (key == 'ArrowDown') {
            dy = GRID_SIZE
        }
        return {
            dx: dx,
            dy: dy
        }
    }
    Diagram.prototype.ArrowsKeysProcess = function(key, ctrlKey, shiftKey) {
        if (this.isEdit) {
            this.activeBlock.field.MoveCursor(key, ctrlKey, shiftKey)
        } else {
            let direction = this.GetArrowsDirection(key)
            this.MoveActiveBlock(direction.dx, direction.dy)
        }
    }
    Diagram.prototype.CancelChanging = function() {
        if (this.action != ACTION_CHANGE_ARROW) return
        if (this.activeArrow == null) this.RemoveArrow(this.activatedArrow)
        this.AddArrow(this.prevArrow, false)
        this.activeArrow = null
        this.action = ''
    }
    Diagram.prototype.EscapeKeyDownProcess = function() {
        this.CancelChanging()
        this.DisableEdit()
        this.ClearArrowsActivation()
        this.isPressed = false
        this.activeBlock = null
        this.activeArrow = null
        this.activatedArrow = null
        this.currSelection = null
    }
    Diagram.prototype.SwitchToMode = function(mode) {
        this.EscapeKeyDownProcess()
        this.mode = mode
    }
    Diagram.prototype.ChangeFormatting = function(action) {
        if (action == BOLD) {
            this.AddHistory(ACTION_CHANGE_FORMATTING, {
                block: this.activeBlock,
                prevBold: this.activeBlock.isBold,
                prevItalic: this.activeBlock.isItalic,
                bold: !this.activeBlock.isBold,
                italic: this.activeBlock.isItalic
            })
            this.activeBlock.isBold = !this.activeBlock.isBold
        } else if (action == ITALIC) {
            this.AddHistory(ACTION_CHANGE_FORMATTING, {
                block: this.activeBlock,
                prevBold: this.activeBlock.isBold,
                prevItalic: this.activeBlock.isItalic,
                bold: this.activeBlock.isBold,
                italic: !this.activeBlock.isItalic
            })
            this.activeBlock.isItalic = !this.activeBlock.isItalic
        } else if (action == CLEAR_FORMAT) {
            this.AddHistory(ACTION_CHANGE_FORMATTING, {
                block: this.activeBlock,
                prevBold: this.activeBlock.isBold,
                prevItalic: this.activeBlock.isItalic,
                bold: false,
                italic: false
            })
            this.activeBlock.isItalic = false
            this.activeBlock.isBold = false
        } else if (action == INCREASE_FONT) {
            if (this.activeBlock.fontSize == MAX_FONT_SIZE) return
            let y = this.activeBlock.y
            let height = this.activeBlock.height
            this.activeBlock.fontSize++
                this.activeBlock.textHeight = this.activeBlock.fontSize
            this.activeBlock.FixSizesByText(this.ctx)
            let arrows = this.RetraceArrows()
            this.AddHistory(ACTION_CHANGE_FONT, {
                block: this.activeBlock,
                prevSize: this.activeBlock.fontSize - 1,
                size: this.activeBlock.fontSize,
                y: y,
                height: height,
                arrows: arrows
            })
        } else if (action == DECREASE_FONT) {
            if (this.activeBlock.fontSize == MIN_FONT_SIZE) return
            let y = this.activeBlock.y
            let height = this.activeBlock.height
            this.activeBlock.fontSize--
                this.activeBlock.textHeight = this.activeBlock.fontSize
            this.activeBlock.FixSizesByText(this.ctx)
            let arrows = this.RetraceArrows()
            this.AddHistory(ACTION_CHANGE_FONT, {
                block: this.activeBlock,
                prevSize: this.activeBlock.fontSize + 1,
                size: this.activeBlock.fontSize,
                y: y,
                height: height,
                arrows: arrows
            })
        } else if (action == LEFT_TEXT_ALIGN) {
            if (this.activeBlock.textAlign == LEFT_TEXT_ALIGN) return
            this.AddHistory(ACTION_CHANGE_ALIGNMENT, {
                block: this.activeBlock,
                prevTextAlign: this.activeBlock.textAlign,
                textAlign: LEFT_TEXT_ALIGN
            })
            this.activeBlock.textAlign = LEFT_TEXT_ALIGN
        } else if (action == CENTER_TEXT_ALIGN) {
            if (this.activeBlock.textAlign == CENTER_TEXT_ALIGN) return
            this.AddHistory(ACTION_CHANGE_ALIGNMENT, {
                block: this.activeBlock,
                prevTextAlign: this.activeBlock.textAlign,
                textAlign: CENTER_TEXT_ALIGN
            })
            this.activeBlock.textAlign = CENTER_TEXT_ALIGN
        }
    }
    Diagram.prototype.DeleteKeyDownProcess = function() {
        if (this.currSelection != null) {
            this.RemoveSelection()
        } else if (this.mode == BLOCK_MODE) {
            this.RemoveActiveBlock()
        } else if (this.mode == CONNECTION_MODE) {
            this.RemoveActivatedArrow()
        }
    }
    Diagram.prototype.ActiveBlockKeyDown = function(e) {
        if (this.activeBlock == null) return false
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
            this.ArrowsKeysProcess(e.key, (e.ctrlKey || e.metaKey), e.shiftKey)
            return true
        } else if ((e.key == 'F2' || e.key == 'Enter') && this.action == '' && !this.isEdit) {
            this.isEdit = true
            this.activeBlock.StartEdit()
            return true
        } else if (this.isEdit && (e.key == 'Backspace' || e.key == 'Delete' || e.key == 'Home' || e.key == 'End')) {
            this.KeyPress(e)
            return true
        } else if ((e.code == 'KeyR' || e.keyCode == 82) && !this.isEdit) {
            this.activeBlock.SwapLabelsOfText((e.ctrlKey || e.metaKey))
            return true
        } else if ((e.code == 'KeyA' || e.keyCode == 65) && (e.ctrlKey || e.metaKey) && this.isEdit) {
            this.activeBlock.field.SelectAll()
            return true
        } else if ((e.code == 'KeyB' || e.keyCode == 66) && (e.ctrlKey || e.metaKey)) {
            this.ChangeFormatting(BOLD)
            return true
        } else if ((e.code == 'KeyI' || e.keyCode == 73) && (e.ctrlKey || e.metaKey)) {
            this.ChangeFormatting(ITALIC)
            return true
        } else if ((e.code == 'Space' || e.keyCode == 32) && (e.ctrlKey || e.metaKey)) {
            this.ChangeFormatting(CLEAR_FORMAT)
            return true
        } else if ((e.code == 'Equal' || e.keyCode == 187) && (e.ctrlKey || e.metaKey) && this.isEdit) {
            this.ChangeFormatting(INCREASE_FONT)
            return true
        } else if ((e.code == 'Minus' || e.keyCode == 189) && (e.ctrlKey || e.metaKey) && this.isEdit) {
            this.ChangeFormatting(DECREASE_FONT)
            return true
        } else if ((e.code == 'KeyL' || e.keyCode == 76) && (e.ctrlKey || e.metaKey) && this.isEdit) {
            this.ChangeFormatting(LEFT_TEXT_ALIGN)
            return true
        } else if ((e.code == 'KeyE' || e.keyCode == 69) && (e.ctrlKey || e.metaKey) && this.isEdit) {
            this.ChangeFormatting(CENTER_TEXT_ALIGN)
            return true
        }
        return false
    }
    Diagram.prototype.ActivetedArrowKeyDown = function(e) {
        if (this.activatedArrow == null) return false
        if (e.code == 'KeyR' || e.keyCode == 82) {
            this.activatedArrow.Reverse()
            return true
        }
        if ((e.code == 'KeyP' || e.keyCode == 80) && (e.ctrlKey || e.metaKey)) {
            this.SavePrevArrow()
            this.activatedArrow.Retrace(this.blocks, this.arrows, true)
            this.AddHistory(ACTION_CHANGE_ARROW, {
                prevArrow: this.prevArrow,
                currArrow: this.activatedArrow
            })
            return true
        }
        return false
    }
    Diagram.prototype.InsertBlockWithConnectorById = function(id, x, y) {
        this.InsertBlockById(id, x, y)
        let result = this.GetBlockAndConnectorByPoint(this.currRealPoint.x, this.currRealPoint.y)
        if (result.connector == null) return
        let arrow = new Arrow(result.block, result.connector)
        let block = this.blocks[this.blocks.length - 1]
        let connectors = result.block.connectors
        let connector = TOP_CONNECTOR
        if (result.connector == connectors[RIGHT_CONNECTOR]) {
            connector = LEFT_CONNECTOR
            block.Move(block.width / 2 + GRID_SIZE, result.block.y - block.y)
        } else if (result.connector == connectors[LEFT_CONNECTOR]) {
            connector = RIGHT_CONNECTOR
            block.Move(-block.width / 2 - GRID_SIZE, result.block.y - block.y)
        } else if (result.connector == connectors[TOP_CONNECTOR]) {
            connector = BOTTOM_CONNECTOR
            block.Move(result.block.x - block.x, -block.height / 2 - GRID_SIZE)
        } else {
            block.Move(result.block.x - block.x, block.height / 2 + GRID_SIZE)
        }
        arrow.TraceTo(block, block.connectors[connector], this.blocks, this.arrows)
        this.AddArrow(arrow)
    }
    Diagram.prototype.ReplaceOutBlocksWithDisplay = function() {
        for (let i = 0; i < this.blocks.length; i++) {
            if (!this.blocks[i].GetText().startsWith('вывод')) continue
            if (this.blocks[i].type == IN_OUT_TYPE) {
                this.blocks[i].type = DISPLAY_TYPE
            } else if (this.blocks[i].type == DISPLAY_TYPE) {
                this.blocks[i].type = IN_OUT_TYPE
            }
        }
    }
    Diagram.prototype.KeyDown = function(e) {
        console.log(e.metaKey, e.code)
        this.needTips = false
        if (e.altKey) {
            e.preventDefault()
        }
        if (e.key == 'Shift') {
            this.shiftKey = true
            e.preventDefault()
        }
        if (this.ActiveBlockKeyDown(e)) {
            e.preventDefault()
            return
        }
        if (this.ActivetedArrowKeyDown(e)) {
            e.preventDefault()
            return
        }
        if ((e.code == 'KeyZ' || e.keyCode == 90) && (e.ctrlKey || e.metaKey)) {
            this.Undo()
            e.preventDefault()
        } else if ((e.code == 'KeyY' || e.keyCode == 89) && (e.ctrlKey || e.metaKey)) {
            this.Repeat()
            e.preventDefault()
        } else if ((e.code == 'KeyC' || e.keyCode == 67) && (e.ctrlKey || e.metaKey) && !this.isEdit) {
            this.Copy()
            e.preventDefault()
        } else if ((e.code == 'KeyV' || e.keyCode == 86) && (e.ctrlKey || e.metaKey) && !this.isEdit) {
            if (this.Paste(e)) e.preventDefault()
        } else if ((e.code == 'KeyA' || e.keyCode == 65) && (e.ctrlKey || e.metaKey)) {
            this.SelectAll()
            e.preventDefault()
        } else if ((e.code == 'KeyS' || e.keyCode == 83) && (e.ctrlKey || e.metaKey)) {
            if (e.shiftKey) {
                this.SavePicture()
            } else if (e.altKey) {
                this.SaveAreas()
            } else {
                this.Save()
            }
            e.preventDefault()
        } else if ((e.code == 'KeyO' || e.keyCode == 79) && (e.ctrlKey || e.metaKey)) {
            this.Load()
            e.preventDefault()
        } else if ((e.code == 'KeyU' || e.keyCode == 85) && (e.ctrlKey || e.metaKey)) {
            this.UploadForGenerate()
            e.preventDefault()
        } else if ((e.code == 'KeyM' || e.keyCode == 77) && (e.ctrlKey || e.metaKey)) {
            this.isFullMenu = !this.isFullMenu
            e.preventDefault()
        } else if ((e.code == 'KeyG' || e.keyCode == 71) && (e.ctrlKey || e.metaKey)) {
            this.needDrawGrid = !this.needDrawGrid
            e.preventDefault()
        } else if ((e.code == 'KeyF' || e.keyCode == 70) && (e.ctrlKey || e.metaKey)) {
            this.JumpToNearest()
            e.preventDefault()
        } else if ((e.code == 'KeyK' || e.keyCode == 75) && (e.ctrlKey || e.metaKey)) {
            this.needKeyboardMenu = !this.needKeyboardMenu
            e.preventDefault()
        } else if ((e.code == 'KeyL' || e.keyCode == 76) && (e.ctrlKey || e.metaKey)) {
            DARK_THEME = 1 - DARK_THEME
            e.preventDefault()
        } else if ((e.code == 'KeyE' || e.keyCode == 69) && (e.ctrlKey || e.metaKey)) {
            this.ReplaceOutBlocksWithDisplay()
            e.preventDefault()
        } else if (e.code == 'Equal' && (e.ctrlKey || e.metaKey)) {
            this.UpdateScale(1)
            e.preventDefault()
        } else if (e.code == 'Minus' && (e.ctrlKey || e.metaKey)) {
            this.UpdateScale(-1)
            e.preventDefault()
        } else if (e.key == 'Tab' && !this.isEdit && this.blocks.length > 0) {
            this.JumpToNextBlock(e.shiftKey)
            e.preventDefault()
        } else if (e.key == 'Escape') {
            this.EscapeKeyDownProcess()
            e.preventDefault()
        } else if (e.key == 'Delete' && !this.isEdit) {
            this.DeleteKeyDownProcess()
            e.preventDefault()
        } else if (Number.isInteger(+e.key) && !this.isEdit && this.activeArrow == null && !this.isPressed) {
            if ((e.ctrlKey || e.metaKey)) {
                this.InsertTemplateById(+e.key - 1, this.currPoint.x, this.currPoint.y)
            } else if (this.activeBlock != null && this.activeBlock.IsMouseHover(this.currRealPoint.x, this.currRealPoint.y)) {
                let index = +e.key - 1
                if (index >= 0 && index < BLOCK_TYPES.length - 2) {
                    this.AddHistory(ACTION_CHANGE_TYPE, {
                        block: this.activeBlock,
                        prev_type: this.activeBlock.type,
                        new_type: BLOCK_TYPES[index]
                    })
                    this.activeBlock.ChangeType(BLOCK_TYPES[index])
                }
            } else {
                this.InsertBlockWithConnectorById(+e.key - 1, this.currPoint.x, this.currPoint.y)
            }
            e.preventDefault()
        }
        if (this.currSelection != null && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            let direction = this.GetArrowsDirection(e.key)
            this.MoveSelection(direction.dx, direction.dy)
            e.preventDefault()
        }
    }
    Diagram.prototype.KeyUp = function(e) {
        if (e.key == 'Shift') this.shiftKey = false
    }
    Diagram.prototype.KeyPress = function(e) {
        if (this.activeBlock == null || !this.isEdit) return
        let prevText = this.activeBlock.GetText()
        let y = this.activeBlock.y
        let height = this.activeBlock.height
        if (e.key == 'Backspace' || e.key == 'Delete') {
            this.activeBlock.RemoveText(e.key, (e.ctrlKey || e.metaKey), e.shiftKey, this.ctx)
        } else {
            this.activeBlock.InsertText(e.key == 'Enter' ? '\n' : e.key, this.ctx)
            if (e.key == ' ') this.activeBlock.ReplaceMathChars()
        }
        if (this.activeBlock.GetText() != prevText) {
            let arrows = this.RetraceArrows()
            this.AddHistory(ACTION_EDIT_BLOCK, {
                block: this.activeBlock,
                prevText: prevText,
                currText: this.activeBlock.GetText(),
                y: y,
                height: height,
                arrows: arrows
            })
        }
        e.preventDefault()
    }
    Diagram.prototype.WindowResize = function() {
        let dpr = window.devicePixelRatio || 1
        this.width = window.innerWidth
        this.height = window.innerHeight - CANVAS_OFFSET
        this.canvas.width = this.width * dpr
        this.canvas.height = this.height * dpr
        this.ctx.scale(dpr, dpr)
        this.canvas.style.width = this.width + "px"
        this.canvas.style.height = this.height + "px"
        if (this.width < MENU_FULL_MIN_SIZE) this.isFullMenu = false
    }
    Diagram.prototype.MouseWheel = function(e) {
        this.needTips = false
        if (this.IsMouseInMenu(this.currPoint.x) || this.IsMouseInRightMenu(this.currPoint.x, this.currPoint.y)) return
        if (e.altKey) {
            this.UpdateScale(Math.sign(-e.deltaY))
            return
        }
        let step = -Math.sign(e.deltaY) * MOUSE_WHEEL_STEP
        let dx = e.shiftKey ? step : 0
        let dy = e.shiftKey ? 0 : step
        this.x0 += dx
        this.y0 += dy
        this.prevPoint.x += dx
        this.prevPoint.y += dy
        this.MouseMove({
            offsetX: this.currPoint.x,
            offsetY: this.currPoint.y,
            target: this.canvas
        })
    }
    Diagram.prototype.DragOver = function(e) {
        this.isDragDrop = true
    }
    Diagram.prototype.DragLeave = function(e) {
        this.isDragDrop = false
    }
    Diagram.prototype.Drop = function(e) {
        this.isDragDrop = false
        let files = e.dataTransfer.files
        if (files.length != 1) {
            alert("Ошибка: можно перетащить только 1 файл")
            return
        }
        let name = files[0].name
        let diagram = this
        let fr = new FileReader();
        if (name.endsWith('.json')) {
            fr.onload = function(e) {
                diagram.Restore(e.target.result)
            };
        } else if (name.endsWith('.c') || name.endsWith('.cpp') || name.endsWith('.h') || name.endsWith('.hpp') || name.endsWith('.pas') || name.endsWith('.py')) {
            fr.onload = function(e) {
                diagram.Generate(e.target.result, name)
            };
        } else {
            alert("Ошибка: неизвестный файл!")
            return
        }
        if (!confirm("Вы уверены? Текущая блок-схема будет утеряна")) return
        let reader = new FileReader()
        reader.onload = function(e) {
            let encoding = e.target.result.indexOf('�') > -1 ? 'cp1251' : 'utf-8'
            fr.readAsText(files[0], encoding)
        }
        reader.readAsText(files[0])
    }
    Diagram.prototype.InsertForLoopTemplate = function(x, y) {
        let block1 = new Block(x, y, '', 100, 40, FOR_LOOP_TYPE)
        let block2 = new Block(x, y + GRID_SIZE * 2 + 40, '', 100, 40, BLOCK_TYPE)
        let block3 = new Block(x, y + GRID_SIZE * 8 + 80, '', 100, 40, BLOCK_TYPE)
        this.AddBlock(block1)
        this.AddBlock(block2)
        this.AddBlock(block3)
        this.AddArrow(this.MakeArrow(block1, BOTTOM_CONNECTOR, block2, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, BOTTOM_CONNECTOR, block1, LEFT_CONNECTOR))
        this.AddArrow(this.MakeArrow(block1, RIGHT_CONNECTOR, block3, TOP_CONNECTOR))
    }
    Diagram.prototype.InsertWhileLoopTemplate = function(x, y) {
        let block1 = new Block(x, y, '', 100, 40, BLOCK_TYPE)
        let block2 = new Block(x, y + GRID_SIZE * 2 + 40, '', 100, 40, CONDITION_TYPE)
        let block3 = new Block(x, y + GRID_SIZE * 4 + 80, '', 100, 40, BLOCK_TYPE)
        let block4 = new Block(x, y + GRID_SIZE * 10 + 120, '', 100, 40, BLOCK_TYPE)
        block2.labelsPosition = 0
        this.AddBlock(block1)
        this.AddBlock(block2)
        this.AddBlock(block3)
        this.AddBlock(block4)
        this.AddArrow(this.MakeArrow(block1, BOTTOM_CONNECTOR, block2, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, BOTTOM_CONNECTOR, block3, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block3, BOTTOM_CONNECTOR, block2, LEFT_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, RIGHT_CONNECTOR, block4, TOP_CONNECTOR))
    }
    Diagram.prototype.InsertForInForTemplate = function(x, y) {
        let block1 = new Block(x, y, '', 100, 40, FOR_LOOP_TYPE)
        let block2 = new Block(x, y + GRID_SIZE * 2 + 40, '', 100, 40, BLOCK_TYPE)
        let block3 = new Block(x, y + GRID_SIZE * 4 + 80, 'j от 1 до n', 100, 40, FOR_LOOP_TYPE)
        let block4 = new Block(x, y + GRID_SIZE * 6 + 120, '', 100, 40, BLOCK_TYPE)
        let block5 = new Block(x, y + GRID_SIZE * 12 + 160, '', 100, 40, BLOCK_TYPE)
        let block6 = new Block(x, y + GRID_SIZE * 18 + 200, '', 100, 40, BLOCK_TYPE)
        this.AddBlock(block1)
        this.AddBlock(block2)
        this.AddBlock(block3)
        this.AddBlock(block4)
        this.AddBlock(block5)
        this.AddBlock(block6)
        this.AddArrow(this.MakeArrow(block1, BOTTOM_CONNECTOR, block2, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, BOTTOM_CONNECTOR, block3, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block3, BOTTOM_CONNECTOR, block4, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block4, BOTTOM_CONNECTOR, block3, LEFT_CONNECTOR))
        this.AddArrow(this.MakeArrow(block3, RIGHT_CONNECTOR, block5, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block5, BOTTOM_CONNECTOR, block1, LEFT_CONNECTOR))
        this.AddArrow(this.MakeArrow(block1, RIGHT_CONNECTOR, block6, TOP_CONNECTOR))
    }
    Diagram.prototype.InsertConditionTemplate = function(x, y) {
        let block1 = new Block(x, y, '', 100, 40, CONDITION_TYPE)
        let block2 = new Block(x + 100, y + GRID_SIZE * 2 + 30, '', 100, 40, BLOCK_TYPE)
        let block3 = new Block(x - 100, y + GRID_SIZE * 2 + 30, '', 100, 40, BLOCK_TYPE)
        let block4 = new Block(x, y + GRID_SIZE * 4 + 100, '', 100, 40, BLOCK_TYPE)
        block2.labelsPosition = 0
        this.AddBlock(block1)
        this.AddBlock(block2)
        this.AddBlock(block3)
        this.AddBlock(block4)
        this.AddArrow(this.MakeArrow(block1, RIGHT_CONNECTOR, block2, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block1, LEFT_CONNECTOR, block3, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, BOTTOM_CONNECTOR, block4, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block3, BOTTOM_CONNECTOR, block4, TOP_CONNECTOR))
    }
    Diagram.prototype.InsertSwitchTemplate = function(x, y) {
        let blocks = []
        let n = 3
        for (let i = 0; i < n; i++) {
            blocks.push(new Block(x, y + i * (GRID_SIZE * 2 + 40), 'i == ' + (i + 1), 100, 40, CONDITION_TYPE))
            blocks.push(new Block(x + GRID_SIZE * 4 + 100, y + i * (GRID_SIZE * 2 + 40), '', 100, 40, BLOCK_TYPE))
            blocks.push(new Block(x + GRID_SIZE * 4 + 200, y + i * (GRID_SIZE * 2 + 40), '', 30, 30, LABEL_TYPE))
            blocks[3 * i].labelsPosition = 0
        }
        blocks.push(new Block(x + GRID_SIZE * 4 + 100, y + n * (GRID_SIZE * 2 + 40), '', 100, 40, BLOCK_TYPE))
        blocks.push(new Block(x + GRID_SIZE * 4 + 200, y + n * (GRID_SIZE * 2 + 40), '', 30, 30, LABEL_TYPE))
        this.AddBlock(blocks[n * 3])
        this.AddBlock(blocks[n * 3 + 1])
        for (let i = 0; i < n; i++) {
            this.AddBlock(blocks[3 * i])
            this.AddBlock(blocks[3 * i + 1])
            this.AddBlock(blocks[3 * i + 2])
            this.AddArrow(this.MakeArrow(blocks[3 * i], RIGHT_CONNECTOR, blocks[3 * i + 1], LEFT_CONNECTOR))
            this.AddArrow(this.MakeArrow(blocks[3 * i + 1], RIGHT_CONNECTOR, blocks[3 * i + 2], LEFT_CONNECTOR))
            this.AddArrow(this.MakeArrow(blocks[3 * i], BOTTOM_CONNECTOR, blocks[3 * i + 3], i == n - 1 ? LEFT_CONNECTOR : TOP_CONNECTOR))
        }
        this.AddArrow(this.MakeArrow(blocks[3 * n], RIGHT_CONNECTOR, blocks[3 * n + 1], LEFT_CONNECTOR))
    }
    Diagram.prototype.InsertProgramTemplate = function(x, y) {
        let block1 = new Block(x, y, 'начало', 100, 30, BEGIN_END_TYPE)
        let block2 = new Block(x, y + GRID_SIZE * 2 + 40, 'вывод "Введите "', 140, 40, IN_OUT_TYPE)
        let block3 = new Block(x, y + GRID_SIZE * 4 + 80, 'ввод ', 140, 40, IN_OUT_TYPE)
        let block4 = new Block(x, y + GRID_SIZE * 16 + 120, 'конец ', 100, 30, BEGIN_END_TYPE)
        this.AddBlock(block1)
        this.AddBlock(block2)
        this.AddBlock(block3)
        this.AddBlock(block4)
        this.AddArrow(this.MakeArrow(block1, BOTTOM_CONNECTOR, block2, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block2, BOTTOM_CONNECTOR, block3, TOP_CONNECTOR))
        this.AddArrow(this.MakeArrow(block3, BOTTOM_CONNECTOR, block4, TOP_CONNECTOR))
    }
    Diagram.prototype.Clear = function(ctx, canvas, width, height) {
        ctx.fillStyle = BACKGROUND_COLOR[DARK_THEME]
        ctx.fillRect(0, 0, width, height)
        canvas.style.cursor = this.isControlPressed ? 'move' : 'default'
        canvas.title = ''
    }
    Diagram.prototype.DrawLine = function(x1, y1, x2, y2) {
        this.ctx.beginPath()
        this.ctx.moveTo(x1, y1)
        this.ctx.lineTo(x2, y2)
        this.ctx.stroke()
    }
    Diagram.prototype.DrawGrid = function() {
        if (!this.needDrawGrid) return
        this.ctx.lineWidth = 1
        let size = GRID_SIZE * 2 * this.scale
        let left = Math.floor(this.x0 / size)
        let right = Math.floor((this.width - this.x0) / size)
        let top = Math.floor(this.y0 / size)
        let bottom = Math.floor((this.height - this.y0) / size)
        for (let i = -left; i <= right; i++) {
            this.ctx.strokeStyle = Math.abs(i) % 5 == 0 ? MAJOR_GRID_COLOR[DARK_THEME] : GRID_COLOR[DARK_THEME]
            this.DrawLine(this.x0 + i * size, 0, this.x0 + i * size, this.height)
        }
        for (let i = -top; i <= bottom; i++) {
            this.ctx.strokeStyle = Math.abs(i) % 5 == 0 ? MAJOR_GRID_COLOR[DARK_THEME] : GRID_COLOR[DARK_THEME]
            this.DrawLine(0, this.y0 + i * size, this.width, this.y0 + i * size)
        }
    }
    Diagram.prototype.DrawArrows = function(ctx, x0, y0, canvas, arrows) {
        for (let i = 0; i < arrows.length; i++) arrows[i].Draw(ctx, x0, y0, this.scale)
        if (this.activeSegment != null) canvas.style.cursor = this.activeSegment.dx == 0 ? 'ew-resize' : 'ns-resize'
    }
    Diagram.prototype.SwitchCursorByAction = function() {
        if (this.action == ACTION_MOVE) {
            this.canvas.style.cursor = 'move'
        } else if (this.action == ACTION_RESIZE) {
            let action = this.history[this.history.length - 1].args
            let dy = ['n', '', 's'][Math.sign(action.dirY) + 1]
            let dx = ['w', '', 'e'][Math.sign(action.dirX) + 1]
            this.canvas.style.cursor = dy + dx + '-resize'
        }
    }
    Diagram.prototype.DrawBlocks = function(ctx, x0, y0, blocks, withBackground = true) {
        for (let i = 0; i < blocks.length; i++) blocks[i].Draw(ctx, x0, y0, this.scale, this.activeBlock == blocks[i] ? BLOCK_ACTIVE_STATUS : BLOCK_DEFAULT_STATUS, withBackground)
        if (this.activeArrow != null) {
            this.activeArrow.AddNode(this.currRealPoint.x, this.currRealPoint.y)
            this.activeArrow.Draw(ctx, x0, y0, this.scale)
            this.activeArrow.RemoveNode()
            let arrow = this.GetArrowByPoint(this.currRealPoint.x, this.currRealPoint.y)
            if (arrow) arrow.Draw(ctx, x0, y0, this.scale)
        }
        this.SwitchCursorByAction()
    }
    Diagram.prototype.DrawResizePointsOnHover = function() {
        if (this.isPressed && this.isEdit && this.activeBlock.IsMouseHover(this.currRealPoint.x, this.currRealPoint.y)) this.canvas.style.cursor = 'text'
        if (this.isPressed || this.activeArrow != null) return false
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            let point = this.blocks[i].GetResizePoint(this.currRealPoint.x, this.currRealPoint.y)
            if (this.blocks[i].IsMouseHover(this.currRealPoint.x, this.currRealPoint.y) || point != null) {
                this.blocks[i].DrawResizePoints(this.ctx, this.x0, this.y0, this.scale)
                this.canvas.style.cursor = this.isEdit && this.blocks[i] == this.activeBlock ? 'text' : 'pointer'
                if (point != null) {
                    let dy = ['n', '', 's'][Math.sign(point.y) + 1]
                    let dx = ['w', '', 'e'][Math.sign(point.x) + 1]
                    this.canvas.style.cursor = dy + dx + '-resize'
                }
                return true
            }
        }
        return false
    }
    Diagram.prototype.DrawConnectorsOnHover = function(drawOneConnector) {
        if (this.isPressed || this.activeSegment != null) return false
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            let connector = this.blocks[i].GetConnector(this.currRealPoint.x, this.currRealPoint.y)
            if (this.activeArrow != null && this.activeArrow.startBlock == this.blocks[i] && this.activeArrow.startConnector == connector) continue
            let isBlockHover = this.blocks[i].IsMouseHover(this.currRealPoint.x, this.currRealPoint.y)
            if (connector != null || isBlockHover) {
                if (this.blocks[i].type == TEXT_TYPE && (this.activeArrow == null && this.activatedArrow == null)) continue;
                this.blocks[i].DrawConnectors(this.ctx, this.x0, this.y0, this.scale)
            }
            if (connector != null && drawOneConnector) {
                connector.Draw(this.ctx, this.x0, this.y0, this.scale)
                this.canvas.style.cursor = 'pointer'
                return true
            }
            if (connector == null && isBlockHover && this.activeArrow != null) {
                connector = this.blocks[i].GetNearsetConnector(this.currRealPoint.x, this.currRealPoint.y)
                if (this.activeArrow.startBlock != this.blocks[i] || this.activeArrow.startConnector != connector) {
                    connector.Draw(this.ctx, this.x0, this.y0, this.scale)
                    this.canvas.style.cursor = 'pointer'
                }
                return true
            }
        }
        return false
    }
    Diagram.prototype.DrawSizesArrow = function(block, isVertical) {
        let x1 = isVertical ? block.right + RESIZE_ARROW_DX : block.left
        let y1 = isVertical ? block.top : block.bottom + RESIZE_ARROW_DY
        let x2 = isVertical ? block.right + RESIZE_ARROW_DX : block.right
        let y2 = isVertical ? block.bottom : block.bottom + RESIZE_ARROW_DY
        if (block.type == IN_OUT_TYPE && isVertical) {
            x1 += IN_OUT_DX / 2
            x2 += IN_OUT_DX / 2
        }
        this.ctx.strokeStyle = ACTIVE_BLOCK_COLOR[DARK_THEME]
        this.ctx.lineWidth = RESIZE_ARROW_LINE_WIDTH
        if (this.scale > 1) this.ctx.lineWidth *= this.scale / 2
        this.DrawLine(x1 * this.scale + this.x0, y1 * this.scale + this.y0, x2 * this.scale + this.x0, y2 * this.scale + this.y0)
        this.ctx.lineWidth = Math.max(1, RESIZE_ARROW_LINE_WIDTH - 1)
        if (isVertical) {
            this.DrawLine((x1 - RESIZE_ARROW_DX / 2) * this.scale + this.x0, y1 * this.scale + this.y0, (x1 + RESIZE_ARROW_DX / 2) * this.scale + this.x0, y1 * this.scale + this.y0)
            this.DrawLine((x2 - RESIZE_ARROW_DX / 2) * this.scale + this.x0, y2 * this.scale + this.y0, (x2 + RESIZE_ARROW_DX / 2) * this.scale + this.x0, y2 * this.scale + this.y0)
        } else {
            this.DrawLine(x1 * this.scale + this.x0, (y1 - RESIZE_ARROW_DY / 2) * this.scale + this.y0, x1 * this.scale + this.x0, (y1 + RESIZE_ARROW_DY / 2) * this.scale + this.y0)
            this.DrawLine(x2 * this.scale + this.x0, (y2 - RESIZE_ARROW_DY / 2) * this.scale + this.y0, x2 * this.scale + this.x0, (y2 + RESIZE_ARROW_DY / 2) * this.scale + this.y0)
        }
    }
    Diagram.prototype.DrawCommonSizesOnResize = function() {
        if (this.action != ACTION_RESIZE || this.activeBlock == null || this.activeResizePoint == null) return
        let dirX = Math.sign(this.activeResizePoint.x)
        let dirY = Math.sign(this.activeResizePoint.y)
        let wasFindX = false
        let wasFindY = false
        for (let i = 0; i < this.blocks.length; i++) {
            if (this.blocks[i] == this.activeBlock) continue
            if (this.activeBlock.width == this.blocks[i].width && dirX != 0) {
                this.DrawSizesArrow(this.blocks[i], false)
                wasFindX = true
            }
            if (this.activeBlock.height == this.blocks[i].height && dirY != 0) {
                wasFindY = true
                this.DrawSizesArrow(this.blocks[i], true)
            }
        }
        if (wasFindX && dirX != 0) this.DrawSizesArrow(this.activeBlock, false)
        if (wasFindY && dirY != 0) this.DrawSizesArrow(this.activeBlock, true)
    }
    Diagram.prototype.DrawPositionArrow = function(block) {
        this.ctx.strokeStyle = POSITION_LINE_COLOR[DARK_THEME]
        this.ctx.lineWidth = POSITION_LINE_WIDTH
        if (this.scale > 1) this.ctx.lineWidth *= this.scale / 2
        this.ctx.setLineDash(POSITION_LINE_DASH)
        this.ctx.beginPath()
        this.ctx.moveTo(block.x * this.scale + this.x0, block.y * this.scale + this.y0)
        this.ctx.lineTo(this.activeBlock.x * this.scale + this.x0, this.activeBlock.y * this.scale + this.y0)
        this.ctx.stroke()
        this.ctx.setLineDash([])
    }
    Diagram.prototype.DrawPositionArrows = function() {
        if (this.action != ACTION_MOVE || this.activeBlock == null) return
        for (let i = 0; i < this.blocks.length; i++) {
            if (this.blocks[i] == this.activeBlock) continue
            if (this.blocks[i].x == this.activeBlock.x || this.blocks[i].y == this.activeBlock.y) this.DrawPositionArrow(this.blocks[i])
        }
    }
    Diagram.prototype.DrawArrowOnHover = function() {
        let arrow = this.activatedArrow
        if (arrow == null || !this.activatedArrow.IsMouseHover(this.currRealPoint.x, this.currRealPoint.y)) arrow = this.GetArrowByPoint(this.currRealPoint.x, this.currRealPoint.y)
        if (arrow != null) {
            arrow.Draw(this.ctx, this.x0, this.y0, this.scale, ARROW_ACTIVE_COLOR[DARK_THEME])
            this.canvas.style.cursor = 'pointer'
        }
    }
    Diagram.prototype.DrawActiveElements = function() {
        if (this.IsMouseInMenu(this.currPoint.x) || this.IsMouseInRightMenu(this.currPoint.x, this.currPoint.y)) return
        let hoverBlock = this.DrawResizePointsOnHover()
        let hoverConnector = this.DrawConnectorsOnHover(!hoverBlock)
        this.DrawCommonSizesOnResize()
        this.DrawPositionArrows()
        if (this.HoverArrowByBlock() || this.HoverBlockByBlock() || hoverBlock || this.action == ACTION_MOVE || this.action == ACTION_RESIZE) return
        if (this.activeArrow != null || hoverConnector || this.activeSegment != null) return
        this.DrawArrowOnHover()
    }
    Diagram.prototype.DrawSelection = function() {
        if (this.currSelection == null) return
        let x = Math.min(this.currSelection.x1, this.currSelection.x2)
        let y = Math.min(this.currSelection.y1, this.currSelection.y2)
        let width = Math.abs(this.currSelection.x1 - this.currSelection.x2)
        let height = Math.abs(this.currSelection.y1 - this.currSelection.y2)
        if (this.IsMouseInSelection(this.currRealPoint.x, this.currRealPoint.y) && this.currSelection.blocks.length > 0) this.canvas.style.cursor = this.isPressed ? 'grabbing' : 'grab'
        this.ctx.strokeStyle = SELECTION_COLOR[DARK_THEME]
        this.ctx.fillStyle = SELECTION_BACKGROUND_COLOR[DARK_THEME]
        this.ctx.lineWidth = SELECTION_LINE_WIDTH
        this.ctx.beginPath()
        this.ctx.rect(x * this.scale + this.x0, y * this.scale + this.y0, width * this.scale, height * this.scale)
        this.ctx.stroke()
        if (this.currSelection.blocks.length == 0) this.ctx.fill()
        for (let i = 0; i < this.currSelection.blocks.length; i++) this.currSelection.blocks[i].Draw(this.ctx, this.x0, this.y0, this.scale, BLOCK_ACTIVE_STATUS)
    }
    Diagram.prototype.DrawInfo = function() {
        this.ctx.textAlign = 'right'
        this.ctx.fillStyle = INFO_MENU_TEXT_COLOR[DARK_THEME]
        this.ctx.font = BLOCK_FONT_SIZE + 'px ' + BLOCK_FONT
        let x0 = INFO_MENU_X0 < 0 ? this.width + INFO_MENU_X0 : INFO_MENU_X0
        let y0 = INFO_MENU_Y0 < 0 ? this.height + INFO_MENU_Y0 : INFO_MENU_Y0
        if (this.activeBlock != null) {
            this.ctx.fillText('Фигура: ' + this.activeBlock.type, x0, y0 - 90)
            this.ctx.fillText('Позиция: (' + this.activeBlock.x + ', ' + this.activeBlock.y + ')', x0, y0 - 75)
            this.ctx.fillText('Размер: ' + this.activeBlock.width + ' x ' + this.activeBlock.height, x0, y0 - 60)
            this.ctx.fillText('Шрифт: ' + this.activeBlock.GetFontInfo(), x0, y0 - 45)
            this.ctx.fillText('Размер шрифта: ' + this.activeBlock.fontSize, x0, y0 - 30)
        }
        this.ctx.fillText('Текущая точка: (' + (this.currRealPoint.x) + ', ' + (this.currRealPoint.y) + ')', x0, y0)
    }
    Diagram.prototype.DrawShortkeyColumns = function(header, items, x0, y0, dy) {
        this.ctx.font = '16px ' + BLOCK_FONT
        this.ctx.fillStyle = SHORTKEYS_TEXT_COLOR[DARK_THEME]
        this.ctx.fillText(header, x0, y0)
        this.ctx.fillStyle = SHORTKEYS_ITEMS_TEXT_COLOR[DARK_THEME]
        for (let i = 0; i < items.length; i++) {
            this.ctx.fillText(items[i][0], x0, y0 + 24 * (i + 1))
            this.ctx.fillText(items[i][1], x0 + dy + 15, y0 + 24 * (i + 1))
        }
    }
    Diagram.prototype.DrawShortKeys = function() {
        let x0 = KEYBOARD_MENU_X0 < 0 ? this.width + KEYBOARD_MENU_X0 : KEYBOARD_MENU_X0
        let y0 = KEYBOARD_MENU_Y0 < 0 ? this.height + KEYBOARD_MENU_Y0 : KEYBOARD_MENU_Y0
        if ((this.currPoint.x < x0 || this.currPoint.x > x0 + KEYBOARD_ICON_WIDTH || this.currPoint.y < y0 || this.currPoint.y > y0 + KEYBOARD_ICON_HEIGHT || this.action != '' || this.activeArrow != null) && !this.needTips) {
            this.ctx.drawImage(this.keyboardIcons[DARK_THEME], x0, y0)
            return
        }
        this.ctx.drawImage(this.keyboardIcons[DARK_THEME + 2], x0, y0)
        if (!this.needTips) this.canvas.style.cursor = 'pointer'
        let width = SHORTKEYS_WIDTH
        x0 = (this.width - width) / 2
        y0 = (this.height - SHORTKEYS_HEIGHT) / 2
        this.ctx.fillStyle = SHORTKEYS_BACKGROUND_COLOR[DARK_THEME]
        this.ctx.strokeStyle = SHORTKEYS_BORDER_COLOR[DARK_THEME]
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.rect(x0, y0, width, SHORTKEYS_HEIGHT)
        this.ctx.fill()
        this.ctx.stroke()
        this.ctx.fillStyle = SHORTKEYS_TEXT_COLOR[DARK_THEME]
        this.ctx.font = '30px ' + BLOCK_FONT
        this.ctx.textAlign = 'left'
        this.ctx.fillText('Горячие клавиши', x0 + 10, y0 + 30)
        let viewItems = [
            ['Отображение меню', 'Ctrl + M'],
            ['Отображение сетки', 'Ctrl + G'],
        ]
        let changeItems = [
            ['Скопировать', 'Ctrl + C'],
            ['Вставить', 'Ctrl + V'],
            ['Удалить', 'Delete'],
            ['Переместить', '←→ ↑↓'],
            ['Добавить узел', 'Ctrl + Click'],
            ['Поменять метки', 'R, Ctrl + R'],
            ['Перетрассировать', 'Ctrl + P'],
            ['Редактировать текст', 'F2'],
        ]
        let fieldItems = [
            ['Отменить действие', 'Ctrl + Z'],
            ['Повторить действие', 'Ctrl + Y'],
            ['Увеличить масштаб', 'Ctrl + +'],
            ['Уменьшить масштаб', 'Ctrl + -'],
            ['Масштабирование', 'Alt + ↕'],
            ['Вертикальное перемещение', '↕'],
            ['Горизонтальное перемещение', 'Shift + ↕'],
            ['Перейти на ближайший блок', 'Ctrl + F'],
            ['Перейти на следующий блок', 'Tab'],
            ['Перейти на предыдущий блок', 'Shift + Tab'],
            ['Выделить всё', 'Ctrl + A'],
            ['Завершить действие', 'Esc'],
        ]
        let editItems = [
            ['Выделить всё', 'Ctrl + A'],
            ['Жирный текст', 'Ctrl + B'],
            ['Курсивный текст', 'Ctrl + I'],
            ['Сбросить форматирование', 'Ctrl + Space'],
            ['Увеличить размер шрифта', 'Ctrl + +'],
            ['Уменьшить размер шрифта', 'Ctrl + -'],
        ]
        let saveItems = [
            ['Сохранить схему (json)', 'Ctrl + S'],
            ['Сохранить схему (png)', 'Ctrl + Shift + S'],
            ['Сохранить области', 'Ctrl + Alt + S'],
            ['Загрузить схему (json)', 'Ctrl + O'],
        ]
        this.DrawShortkeyColumns('Изменение', changeItems, x0 + 10, y0 + 70, 155)
        this.DrawShortkeyColumns('Вид', viewItems, x0 + 10, y0 + 118 + changeItems.length * 24, 155)
        this.DrawShortkeyColumns('Поле', fieldItems, x0 + 10 + 290, y0 + 70, 230)
        this.DrawShortkeyColumns('Редактирование текста', editItems, x0 + 10 + 650, y0 + 70, 210)
        this.DrawShortkeyColumns('Сохранение / загрузка ', saveItems, x0 + 10 + 650, y0 + 118 + editItems.length * 24, 210)
    }
    Diagram.prototype.DrawBottomMenu = function() {
        let x0 = BOTTOM_MENU_X0 < 0 ? this.width + BOTTOM_MENU_X0 : BOTTOM_MENU_X0
        let y0 = BOTTOM_MENU_Y0 < 0 ? this.height + BOTTOM_MENU_Y0 : BOTTOM_MENU_Y0
        if (this.activeBlock != null || this.activatedArrow != null || this.activeArrow != null || (this.currSelection != null && this.currSelection.blocks.length > 0)) {
            if (this.currPoint.x < x0 - BOTTOM_MENU_ICON_SIZE || this.currPoint.x >= x0 || this.currPoint.y < y0 || this.currPoint.y >= y0 + BOTTOM_MENU_ICON_SIZE) {
                this.ctx.drawImage(this.removeIcons[DARK_THEME], x0 - BOTTOM_MENU_ICON_SIZE, y0)
            } else {
                this.ctx.drawImage(this.removeIcons[DARK_THEME + 2], x0 - BOTTOM_MENU_ICON_SIZE, y0)
                this.canvas.style.cursor = 'pointer'
            }
        }
        for (let i = 0; i < this.bottomMenuIcons.length; i++) {
            let icons = this.bottomMenuIcons[i]
            let x = x0 + i * BOTTOM_MENU_ICON_SIZE + (BOTTOM_MENU_ICON_SIZE - icons[0].width) / 2
            let y = y0 + (BOTTOM_MENU_ICON_SIZE - icons[0].height) / 2
            let iconIndex = DARK_THEME + 2
            if (i == 4 && !this.needDrawGrid) iconIndex += 4
            if (this.action != '' || this.activeArrow != null) {
                iconIndex -= 2
                this.ctx.drawImage(icons[iconIndex], x, y0)
                continue
            }
            if (this.currPoint.x < x || this.currPoint.x >= x + BOTTOM_MENU_ICON_SIZE || this.currPoint.y < y0 || this.currPoint.y >= y0 + BOTTOM_MENU_ICON_SIZE) {
                iconIndex -= 2
            } else if (i == 0 && this.history.length == 0) {
                iconIndex = DARK_THEME
            } else if (i == 1 && this.antiHistory.length == 0) {
                iconIndex = DARK_THEME
            } else if (i == 2 && this.scaleIndex == 0) {
                iconIndex = DARK_THEME
            } else if (i == 3 && this.scaleIndex == this.scales.length - 1) {
                iconIndex = DARK_THEME
            }
            this.ctx.drawImage(icons[iconIndex], x, y0)
            if (iconIndex % 4 == DARK_THEME + 2) this.canvas.style.cursor = 'pointer'
        }
    }
    Diagram.prototype.DrawIconWithInfo = function(icon, y0, text, label) {
        this.ctx.textBaseline = 'middle'
        let width = this.ctx.measureText(text).width
        this.ctx.drawImage(this.infoIcons[icon][DARK_THEME], MENU_X0, y0)
        if (this.isFullMenu) {
            this.ctx.textAlign = 'left'
            this.ctx.font = '14px ' + BLOCK_FONT
            this.ctx.fillStyle = MAIN_INFO_TEXT_COLOR[DARK_THEME]
            this.ctx.fillText(label + ': ' + text, MENU_X0 + MAIN_INFO_ICON_SIZE + 5, y0 + MAIN_INFO_ICON_SIZE / 2)
        } else {
            this.ctx.textAlign = 'center'
            this.ctx.font = '11px ' + BLOCK_FONT
            this.ctx.fillStyle = MENU_BACKGROUND_COLOR[DARK_THEME]
            this.ctx.fillRect(MENU_X0 + MAIN_INFO_ICON_SIZE - width / 2 - 5, y0 + MAIN_INFO_ICON_SIZE - 12, width, 12)
            this.ctx.fillStyle = MAIN_INFO_TEXT_COLOR[DARK_THEME]
            this.ctx.fillText(text, MENU_X0 + MAIN_INFO_ICON_SIZE - 5, y0 + MAIN_INFO_ICON_SIZE - 5)
            if (this.currPoint.x < MENU_WIDTH[false] && this.currPoint.y >= y0 && this.currPoint.y < y0 + MAIN_INFO_ICON_SIZE) this.canvas.title = label
        }
    }
    Diagram.prototype.DrawMainInfo = function() {
        let y0 = MAIN_INFO_Y0 < 0 ? this.height + MAIN_INFO_Y0 : MAIN_INFO_Y0
        let maxHeight = this.height - BLOCKS_MENU_HEIGHT - SAVE_LOAD_MENU_HEIGHT - 10 - Math.abs(MAIN_INFO_Y0)
        if (maxHeight > 3 * MAIN_INFO_ICON_SIZE) this.DrawIconWithInfo(0, y0 - 110, this.blocks.length, 'Количество блоков')
        if (maxHeight > 2 * MAIN_INFO_ICON_SIZE) this.DrawIconWithInfo(1, y0 - 70, this.arrows.length, 'Количество стрелок')
        if (maxHeight > MAIN_INFO_ICON_SIZE) this.DrawIconWithInfo(this.scale < 1 ? 2 : 3, y0 - 30, Math.round(this.scale * 1000) / 10 + "%", 'Текущий масштаб')
    }
    Diagram.prototype.DrawMenu = function() {
        this.ctx.fillStyle = MENU_BACKGROUND_COLOR[DARK_THEME]
        this.ctx.fillRect(0, 0, MENU_WIDTH[this.isFullMenu], this.height)
        this.ctx.strokeStyle = MENU_BORDER_COLOR[DARK_THEME]
        this.ctx.lineWidth = MENU_BORDER_WIDTH
        this.ctx.beginPath()
        this.ctx.moveTo(MENU_WIDTH[this.isFullMenu], 0)
        this.ctx.lineTo(MENU_WIDTH[this.isFullMenu], this.height)
        this.ctx.stroke()
        for (let i = 0; i < this.menuBlocks.length; i++) {
            this.menuBlocks[i].Draw(this.ctx, 0, 0, 1)
            if (!this.isFullMenu) continue
            this.ctx.fillStyle = MENU_TEXT_COLOR[DARK_THEME]
            this.ctx.textAlign = 'left'
            this.ctx.fillText(BLOCK_TYPES[i] + " (" + (i + 1) + ")", this.menuBlocks[i].x + BLOCKS_MENU_BLOCK_WIDTH / 2 + 10, this.menuBlocks[i].y)
        }
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            this.ctx.drawImage(this.menuIcons[i][DARK_THEME], MENU_X0 + (BLOCKS_MENU_BLOCK_WIDTH - this.menuIcons[i][DARK_THEME].width) / 2, SAVE_LOAD_MENU_Y0 + (i + 0.5) * SAVE_LOAD_MENU_ITEM_HEIGHT - this.menuIcons[i][DARK_THEME].height / 2)
            if (this.isFullMenu) this.ctx.fillText(MENU_ITEMS[i], MENU_X0 + BLOCKS_MENU_BLOCK_WIDTH + 10, SAVE_LOAD_MENU_Y0 + (i + 0.5) * SAVE_LOAD_MENU_ITEM_HEIGHT)
        }
        this.DrawMainInfo()
        this.DrawMenuOnHover()
    }
    Diagram.prototype.DrawMenuOnHover = function() {
        if (this.action != '' || this.activeArrow != null || this.currPoint.x > MENU_WIDTH[this.isFullMenu]) return
        let x = this.currPoint.x
        let y = this.currPoint.y
        this.canvas.style.cursor = 'default'
        for (let i = 0; i < this.menuBlocks.length; i++) {
            let block = this.menuBlocks[i]
            if (y < block.top - BLOCKS_MENU_ITEM_PADDING || y >= block.bottom + BLOCKS_MENU_ITEM_PADDING) continue
            this.ctx.fillStyle = MENU_BLOCK_ACTIVE_COLOR[DARK_THEME]
            this.ctx.fillRect(0, block.top - BLOCKS_MENU_ITEM_PADDING, MENU_WIDTH[this.isFullMenu], block.height + BLOCKS_MENU_ITEM_PADDING * 2)
            this.canvas.style.cursor = 'pointer'
            block.Draw(this.ctx, 0, 0, 1, BLOCK_SELECTED_STATUS)
            if (!this.isFullMenu) {
                this.canvas.title = block.type
                continue
            }
            this.ctx.fillStyle = MENU_ACTIVE_TEXT_COLOR[DARK_THEME]
            this.ctx.textAlign = 'left'
            this.ctx.fillText(block.type + " (" + (i + 1) + ")", block.x + BLOCKS_MENU_BLOCK_WIDTH / 2 + 10, block.y)
        }
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            if (y < SAVE_LOAD_MENU_Y0 + i * SAVE_LOAD_MENU_ITEM_HEIGHT || y > SAVE_LOAD_MENU_Y0 + (i + 1) * SAVE_LOAD_MENU_ITEM_HEIGHT) continue
            this.ctx.fillStyle = MENU_BLOCK_ACTIVE_COLOR[DARK_THEME]
            this.ctx.fillRect(0, SAVE_LOAD_MENU_Y0 + i * SAVE_LOAD_MENU_ITEM_HEIGHT, MENU_WIDTH[this.isFullMenu], SAVE_LOAD_MENU_ITEM_HEIGHT)
            this.ctx.drawImage(this.menuIcons[i][2], MENU_X0 + (BLOCKS_MENU_BLOCK_WIDTH - this.menuIcons[i][DARK_THEME].width) / 2, SAVE_LOAD_MENU_Y0 + (i + 0.5) * SAVE_LOAD_MENU_ITEM_HEIGHT - this.menuIcons[i][DARK_THEME].height / 2)
            this.canvas.style.cursor = 'pointer'
            if (!this.isFullMenu) {
                this.canvas.title = MENU_ITEMS[i]
                continue
            }
            this.ctx.fillStyle = MENU_ACTIVE_TEXT_COLOR[DARK_THEME]
            this.ctx.textAlign = 'left'
            this.ctx.fillText(MENU_ITEMS[i], MENU_X0 + BLOCKS_MENU_BLOCK_WIDTH + 10, SAVE_LOAD_MENU_Y0 + (i + 0.5) * SAVE_LOAD_MENU_ITEM_HEIGHT)
        }
    }
    Diagram.prototype.IsActiveRightMenuItem = function(item, block) {
        if (item == 'edit' && this.isEdit) return true
        if (item == 'bold' && block.isBold) return true
        if (item == 'italic' && block.isItalic) return true
        if (item == 'left-align' && block.textAlign == LEFT_TEXT_ALIGN) return true
        if (item == 'center-align' && block.textAlign == CENTER_TEXT_ALIGN) return true
        return false
    }
    Diagram.prototype.CanActiveRightMenuItem = function(item, block) {
        if (item == 'edit' && !this.isEdit) return true
        if (item == 'bold') return true
        if (item == 'italic') return true
        if (item == 'decrease-font') return block.fontSize > MIN_FONT_SIZE
        if (item == 'increase-font') return block.fontSize < MAX_FONT_SIZE
        if (item == 'left-align') return block.textAlign != LEFT_TEXT_ALIGN
        if (item == 'center-align') return block.textAlign != CENTER_TEXT_ALIGN
        return false
    }
    Diagram.prototype.DrawRightMenu = function() {
        if (this.activeBlock == null) return
        let count = this.rightIcons.length
        if (!this.activeBlock.CanSwapLabelsOrText()) count--
            let x0 = this.width + RIGHT_MENU_X0
        let y0 = 0
        for (let i = 0; i < count; i++) {
            let x = x0 + 10
            let y = y0 + RIGHT_MENU_ICON_SIZE * i
            if (this.IsActiveRightMenuItem(this.rightItems[i], this.activeBlock)) {
                this.ctx.drawImage(this.rightIcons[i][DARK_THEME + 2], x, y + 3)
                if (this.currPoint.x >= x0 && this.currPoint.y >= y && this.currPoint.y <= y + RIGHT_MENU_ICON_SIZE && this.CanActiveRightMenuItem(this.rightItems[i], this.activeBlock)) {
                    this.canvas.style.cursor = 'pointer'
                    this.canvas.title = this.rightHints[i]
                }
                continue
            }
            if (this.currPoint.x < x0 || this.currPoint.y < y || this.currPoint.y > y + RIGHT_MENU_ICON_SIZE) {
                this.ctx.drawImage(this.rightIcons[i][DARK_THEME], x, y + 3)
                continue
            }
            if (this.CanActiveRightMenuItem(this.rightItems[i], this.activeBlock)) {
                this.ctx.drawImage(this.rightIcons[i][DARK_THEME + 2], x, y + 3)
                this.canvas.style.cursor = 'pointer'
            } else {
                this.ctx.drawImage(this.rightIcons[i][DARK_THEME], x, y + 3)
            }
            this.canvas.title = this.rightHints[i]
        }
    }
    Diagram.prototype.DrawDragAndDrop = function() {
        if (!this.isDragDrop) return
        this.ctx.fillStyle = DRAG_AND_DROP_BACKGROUND_COLOR[DARK_THEME]
        this.ctx.fillRect(0, 0, this.width, this.height)
        this.ctx.fillStyle = DRAG_AND_DROP_TEXT_COLOR[DARK_THEME]
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'middle'
        this.ctx.font = DRAG_AND_DROP_FONT
        this.ctx.fillText("Отпустите файл для загрузки схемы", this.width / 2, this.height / 2)
    }
    Diagram.prototype.DrawTips = function() {
        if (!this.needTips) return
        this.ctx.textAlign = 'center'
        this.ctx.font = '30px ' + BLOCK_FONT
        this.ctx.fillStyle = TIPS_TEXT_COLOR[DARK_THEME]
        let text1 = 'Совет: для отображения информации о'
        let text2 = 'горячих клавишах, наведите мышь на иконку'
        let x0 = this.width / 2
        let y0 = (this.height - SHORTKEYS_HEIGHT) / 2 - 60
        this.ctx.fillText(text1, x0, y0)
        this.ctx.fillText(text2, x0, y0 + 30)
        this.ctx.drawImage(this.keyboardIcons[2 - DARK_THEME], x0 + this.ctx.measureText(text2).width / 2 + 10, y0 + 30 - KEYBOARD_ICON_HEIGHT / 2)
    }
    Diagram.prototype.DrawKeyboardIcon = function(text, x, y, backColor, foreColor) {
        this.ctx.fillStyle = backColor
        this.ctx.strokeStyle = foreColor
        this.ctx.fillRect(x, y, KEYBOARD_KEY_SIZE, KEYBOARD_KEY_SIZE)
        this.ctx.beginPath()
        this.ctx.lineWidth = 1
        this.ctx.rect(x, y, KEYBOARD_KEY_SIZE, KEYBOARD_KEY_SIZE)
        this.ctx.stroke()
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'middle'
        this.ctx.font = KEYBOARD_ICON_FONT
        this.ctx.fillStyle = foreColor
        this.ctx.fillText(text, x + KEYBOARD_KEY_SIZE / 2, y + KEYBOARD_KEY_SIZE / 2)
    }
    Diagram.prototype.DrawKeyboard = function() {
        if (!this.isEdit || !this.needKeyboardMenu) return
        let x0 = this.GetKeyboardMenuX0()
        let y = 0
        for (let i = 0; i < KEYBOARD_CHARACTERS.length; i++) {
            if (i % KEYBOARD_CHARACTERS_PER_ROW == 0 && i > 0) y += KEYBOARD_KEY_SIZE
            let key = KEYBOARD_CHARACTERS[i]
            if (this.shiftKey) key = key.toUpperCase()
            this.DrawKeyboardIcon(key, x0 + (i % KEYBOARD_CHARACTERS_PER_ROW) * KEYBOARD_KEY_SIZE, y, MENU_BACKGROUND_COLOR[DARK_THEME], KEYBOARD_COLOR[DARK_THEME])
        }
        if (this.IsMouseInKeyboardMenu(this.currPoint.x, this.currPoint.y)) {
            let position = this.GetKeyboardMenuKeyPosition()
            let key = KEYBOARD_CHARACTERS[position.index]
            let x = x0 + position.column * KEYBOARD_KEY_SIZE
            if (this.shiftKey) key = key.toUpperCase()
            this.DrawKeyboardIcon(key, x, position.row * KEYBOARD_KEY_SIZE, MENU_BACKGROUND_COLOR[DARK_THEME], KEYBOARD_ACTIVE_COLOR[DARK_THEME])
            this.canvas.style.cursor = 'pointer'
        }
    }
    Diagram.prototype.Draw = function() {
        this.Clear(this.ctx, this.canvas, this.width, this.height)
        this.DrawGrid()
        this.DrawArrows(this.ctx, this.x0, this.y0, this.canvas, this.arrows)
        this.DrawBlocks(this.ctx, this.x0, this.y0, this.blocks)
        this.DrawActiveElements()
        this.DrawSelection()
        this.DrawMenu()
        this.DrawRightMenu()
        this.DrawInfo()
        this.DrawBottomMenu()
        this.DrawTips()
        this.DrawShortKeys()
        this.DrawDragAndDrop()
        this.DrawKeyboard()
    }
    Diagram.prototype.HoverArrowByBlock = function() {
        if (this.action != ACTION_MOVE || this.activeBlock == null) return false
        if (this.activeBlock.type == TEXT_TYPE || this.HasBlockConnections(this.activeBlock)) return false
        let result = this.GetArrowAndVerticalSegmentByPoint(this.activeBlock.x, this.activeBlock.y)
        if (result != null) {
            result.arrow.Draw(this.ctx, this.x0, this.y0, this.scale, ARROW_ACTIVE_COLOR[DARK_THEME])
            return true
        }
        return false
    }
    Diagram.prototype.HoverBlockByBlock = function() {
        if (this.action != ACTION_MOVE || this.activeBlock == null || this.activeBlock.type == TEXT_TYPE) return false
        let block = this.activeBlock
        let result = this.GetBlockAndConnectorByBlock()
        if (result != null) {
            result.block.Draw(this.ctx, this.x0, this.y0, this.scale, BLOCK_ACTIVE_STATUS)
            result.connector1.Draw(this.ctx, this.x0, this.y0, this.scale, true)
            result.connector2.Draw(this.ctx, this.x0, this.y0, this.scale, true)
            return true
        }
        return false
    }
    Diagram.prototype.Save = function() {
        let link = document.createElement("a")
        let file = new Blob([this.MakeJSON()], {
            type: 'json'
        })
        link.href = URL.createObjectURL(file)
        link.download = this.name + '.json'
        link.click()
        this.isPressed = false
    }
    Diagram.prototype.SaveArea = function(area) {
        let info = this.GetAreaInfo(area)
        let bbox = info.bbox
        let x = (bbox.x1 + bbox.x2) / 2
        let y = (bbox.y1 + bbox.y2) / 2
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        canvas.width = Math.round((bbox.x2 - bbox.x1) * this.scale)
        canvas.height = Math.round((bbox.y2 - bbox.y1) * this.scale)
        let x0 = canvas.width / 2 - x * this.scale
        let y0 = canvas.height / 2 - y * this.scale
        if (SAVE_WITH_BACKGROUND) {
            this.Clear(ctx, canvas, canvas.width, canvas.height)
        }
        this.DrawArrows(ctx, x0, y0, canvas, info.arrows)
        this.DrawBlocks(ctx, x0, y0, area, false)
        return canvas.toDataURL()
    }
    Diagram.prototype.SaveAreas = function() {
        this.EscapeKeyDownProcess()
        let areas = this.GetRelatedAreas()
        if (areas.length == 0) {
            alert("Связанных областей не обнаружено")
            return
        }
        if (areas.length == 1) {
            let link = document.createElement("a")
            link.href = this.SaveArea(areas[0])
            link.download = this.name + '.png'
            link.click()
            return
        }
        let zip = new JSZip();
        let name = this.name
        for (let i = 0; i < areas.length; i++) zip.file(this.name + '_' + (i + 1) + '.png', this.SaveArea(areas[i]).replace("data:image/png;base64,", ""), {
            base64: true
        })
        zip.generateAsync({
            type: "base64"
        }).then(function(base64) {
            let link = document.createElement("a")
            link.href = "data:application/zip;base64," + base64
            link.download = name + '.zip'
            link.click()
        });
    }
    Diagram.prototype.SavePicture = function() {
        this.EscapeKeyDownProcess()
        if (this.blocks.length == 0) {
            alert("Блок-схема пуста. Сохранять нечего")
            return
        }
        let link = document.createElement("a")
        link.href = this.SaveArea(this.blocks)
        link.download = this.name + '.png'
        link.click()
    }
    let canvas = document.getElementById("canvas")
    let input = document.getElementById('input');
    let sourceInput = document.getElementById('source-input');
    let textInput = document.getElementById('text-input')
    let diagram = new Diagram(canvas, input, sourceInput, textInput)
    
    function Draw() {
        diagram.Draw()
        window.requestAnimationFrame(Draw)
    }
    window.requestAnimationFrame(Draw) 