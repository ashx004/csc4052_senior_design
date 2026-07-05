from tkinter import *
from tkinter import messagebox

#frame is a class already existing in tkinter 
class App(Frame):
	#master is the window we're attatching to
	def __init__(self, master):
		super().__init__(master)
		self.b1 = Button(master, text = "Bye", fg = "dark red", bg = "white", command = self.quit)
		self.b2 = Button(master, text = "Hi", command = self.say)
		self.b1.pack(side = LEFT)
		self.b2.pack(side = RIGHT)
	
	def say(self):
		msg = messagebox.showinfo("ATTENTION", "You were a mistake lol")

window = Tk()
app = App(window)
window.mainloop()