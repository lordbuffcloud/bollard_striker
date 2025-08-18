import pygame
import random
import json
import os
import webbrowser
import datetime
import hashlib  # Import hashlib for hashing

# Initialize Pygame
pygame.init()

# Screen dimensions
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600

# Colors
STEEL_GRAY = (44, 47, 51)          # #2C2F33
CONCRETE_GRAY = (64, 68, 75)       # #40444B
ELECTRIC_ORANGE = (255, 111, 0)    # #FF6F00
CAUTION_YELLOW = (255, 215, 0)     # #FFD700
DEEP_RED = (178, 34, 34)           # #B22222
BOLT_BLUE = (70, 130, 180)         # #4682B4
HIGH_CONTRAST_WHITE = (255, 255, 255)  # #FFFFFF
CARBON_BLACK = (13, 13, 13)        # #0D0D0D
METALLIC_SILVER = (192, 192, 192)  # #C0C0C0
NEON_GREEN = (57, 255, 20)         # #39FF14

# Primary Background Colors
PRIMARY_BACKGROUND = STEEL_GRAY  # Main background for a gritty, industrial feel.
SECONDARY_BACKGROUND = CONCRETE_GRAY  # Contrast on UI elements like scoreboards or banners.

# Accent Colors
ACCENT_PRIMARY = ELECTRIC_ORANGE  # Highlight important elements like active buttons, score flashes, and indicators.
ACCENT_SECONDARY = CAUTION_YELLOW  # Critical elements like countdown timers, warnings, or high scores.

# Strike and Action Colors
STRIKE_COLOR = DEEP_RED            # Striking animations and hit effects.
ACTION_COLOR = BOLT_BLUE           # Positive action highlights like power-ups or special effects.

# Text and Icon Colors
TEXT_PRIMARY = HIGH_CONTRAST_WHITE  # Main text for readability against darker backgrounds.
TEXT_SECONDARY = CARBON_BLACK       # Additional depth in lighter areas for borders or icons.

# Navigation and Interactive Elements
NAVIGATION_COLOR = METALLIC_SILVER  # Navigation bars and interactive elements for an industrial sheen.
INTERACTIVE_HIGHLIGHT = NEON_GREEN   # High-energy elements for special effects or interactive buttons.

# Update existing color usages
WHITE = TEXT_PRIMARY
RED = STRIKE_COLOR
BLACK = TEXT_SECONDARY
GREEN = INTERACTIVE_HIGHLIGHT
BLUE = ACTION_COLOR
BUTTON_COLOR = ACCENT_PRIMARY
DARK_GREY = SECONDARY_BACKGROUND
LIGHT_BLUE = NAVIGATION_COLOR
LIGHT_GREEN = INTERACTIVE_HIGHLIGHT
GREY = SECONDARY_BACKGROUND

# Create the window with caption
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('WPAFB Gate Simulation - Avoid the Bollards')

# Load images
try:
    visitor_image = pygame.image.load('visitor.png')  # Replace with your image file
    bollard_image = pygame.image.load('bollard.png')  # Replace with your image file
except pygame.error as e:
    print(f"Error loading images: {e}")
    pygame.quit()
    exit()

# Resize images to fit the game (Visitor is larger now)
visitor_image = pygame.transform.scale(visitor_image, (100, 100))
bollard_image = pygame.transform.scale(bollard_image, (50, 50))

# Fonts
font = pygame.font.SysFont("Arial", 36)
game_over_font = pygame.font.SysFont("Arial", 64)
title_font = pygame.font.SysFont("Arial", 48, bold=True)
subtitle_font = pygame.font.SysFont("Arial", 36, bold=True)
button_font = pygame.font.SysFont("Arial", 36)
credit_font = pygame.font.SysFont("Arial", 20)

# Secret key for hashing (keep this secret!)
SECRET_KEY = "your_very_secret_key"  # Define a secret key

# Leaderboard file
LEADERBOARD_FILE = 'leaderboard.json'

# Visitor properties
visitor_x = SCREEN_WIDTH // 2 - 50  # Centered horizontally (larger visitor)
visitor_y = SCREEN_HEIGHT - 150  # Starting closer to the bottom
visitor_speed = 7  # Increase movement speed

# Health and score
visitor_health = 3
score = 0

# Initialize progression variables
current_level = 1
level_threshold = 10  # Points required to level up
score_multiplier = 1  # Multiplier based on level

# Bollard properties
bollard_width = 50
bollard_height = 50
bollard_speed = 7
bollard_list = []

# Add initial bollards
for _ in range(5):
    x_pos = random.randint(0, SCREEN_WIDTH - bollard_width)
    y_pos = random.randint(-150, -50)  # Start off-screen
    bollard_list.append([x_pos, y_pos])

# Load sounds
try:
    pygame.mixer.init()
    pygame.mixer.music.load('sounds/background.mp3')  # Background music file
    collision_sound = pygame.mixer.Sound('sounds/collision.mp3')  # Updated collision sound effect
    click_sound = pygame.mixer.Sound('sounds/click.mp3')  # Updated button click sound effect
    # Removed automatic music play to start silent
    # pygame.mixer.music.play(-1)  # Play background music in a loop
except pygame.error as e:
    print(f"Error loading sounds: {e}")
    # Optionally, continue without sound
    collision_sound = None
    click_sound = None

# Sound Control
sound_enabled = False  # Sound is off by default

# Function to draw visitor
def draw_visitor(x, y):
    screen.blit(visitor_image, (x, y))

# Function to draw bollards
def draw_bollards(bollard_list):
    for bollard in bollard_list:
        screen.blit(bollard_image, (bollard[0], bollard[1]))

# Function to check for collisions
def check_collision(bollard_list, visitor_x, visitor_y):
    for bollard in bollard_list:
        if (bollard[1] + bollard_height > visitor_y and
            bollard[1] < visitor_y + 100 and
            bollard[0] + bollard_width > visitor_x and
            bollard[0] < visitor_x + 100):
            if collision_sound:
                collision_sound.play()
            return True
    return False

# Function to increase difficulty based on score
def increase_difficulty():
    global bollard_speed, current_level, score_multiplier
    if score >= level_threshold * current_level:
        bollard_speed += 1  # Increase bollard speed every level_threshold points
        current_level += 1   # Move to next level
        score_multiplier += 0.5  # Increase score multiplier

# Update the Button Class for Better UI
class Button:
    def __init__(self, rect, color, text, text_color=TEXT_PRIMARY, hover_color=ACCENT_SECONDARY, font=button_font):
        self.rect = pygame.Rect(rect)
        self.color = color
        self.text = text
        self.text_color = text_color
        self.hover_color = hover_color
        self.font = pygame.font.SysFont("Arial", 40, bold=True)  # Increased font size and made it bold
        self.hovered = False

    def draw(self, surface):
        # Change color on hover
        current_color = self.hover_color if self.hovered else self.color
        pygame.draw.rect(surface, current_color, self.rect, border_radius=10)
        pygame.draw.rect(surface, METALLIC_SILVER, self.rect, width=4, border_radius=10)  # Thicker border for contrast

        # Render text with shadow for better readability
        text_surf = self.font.render(self.text, True, self.text_color)
        shadow_surf = self.font.render(self.text, True, CARBON_BLACK)
        shadow_offset = 2

        # Position text and shadow
        text_rect = text_surf.get_rect(center=self.rect.center)
        shadow_rect = shadow_surf.get_rect(center=(self.rect.centerx + shadow_offset, self.rect.centery + shadow_offset))

        # Draw shadow first
        surface.blit(shadow_surf, shadow_rect)
        surface.blit(text_surf, text_rect)

    def is_hovered(self, mouse_pos):
        return self.rect.collidepoint(mouse_pos)

    def is_clicked(self, mouse_pos):
        if self.rect.collidepoint(mouse_pos) and sound_enabled and click_sound:
            click_sound.play()
        return self.rect.collidepoint(mouse_pos)

# Function to ask for player's name and update the leaderboard
def get_player_name():
    player_name = ''
    input_active = True
    input_rect = pygame.Rect(SCREEN_WIDTH // 2 - 200, SCREEN_HEIGHT // 2 - 50, 400, 50)
    color_inactive = GREY
    color_active = BLUE
    color = color_inactive
    while input_active:
        screen.fill(WHITE)
        # Render prompt
        name_prompt = font.render("Enter your name:", True, BLACK)
        screen.blit(name_prompt, (SCREEN_WIDTH // 2 - name_prompt.get_width() // 2, SCREEN_HEIGHT // 2 - 100))
        # Render input box
        pygame.draw.rect(screen, color, input_rect, 2)
        # Render current name
        name_surf = font.render(player_name, True, BLACK)
        screen.blit(name_surf, (input_rect.x + 10, input_rect.y + 10))
        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                # If the user clicked on the input_box rect
                if input_rect.collidepoint(event.pos):
                    color = color_active
                else:
                    color = color_inactive
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    if player_name.strip() != '':
                        input_active = False
                elif event.key == pygame.K_BACKSPACE:
                    player_name = player_name[:-1]
                else:
                    if len(player_name) < 20:  # Limit name length
                        player_name += event.unicode
    return player_name

# Function to generate hash for the leaderboard data
def generate_leaderboard_hash(data):
    """
    Generates a SHA-256 hash of the leaderboard data combined with a secret key.
    """
    hash_input = json.dumps(data, sort_keys=True) + SECRET_KEY
    return hashlib.sha256(hash_input.encode()).hexdigest()

# Function to update and save the leaderboard with hash
def update_leaderboard(player_name, score, level):
    leaderboard = []  # Initialize an empty leaderboard

    # Check if the file exists and contains valid JSON
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, 'r') as f:
                leaderboard_data = json.load(f)
                leaderboard = leaderboard_data.get('entries', [])
        except json.JSONDecodeError:
            print("Leaderboard file is empty or corrupted. Initializing new leaderboard.")

    # Add the new score with additional details
    leaderboard.append({
        'name': player_name,
        'score': score,
        'level': level,
        'date': datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

    # Sort the leaderboard by score in descending order and keep the top 5 scores
    leaderboard = sorted(leaderboard, key=lambda x: x['score'], reverse=True)[:5]

    # Generate hash for the leaderboard
    leaderboard_hash = generate_leaderboard_hash(leaderboard)

    # Save the updated leaderboard and its hash back to the file
    with open(LEADERBOARD_FILE, 'w') as f:
        json.dump({
            'entries': leaderboard,
            'hash': leaderboard_hash
        }, f, indent=4)

# Function to load and verify the leaderboard
def load_leaderboard():
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, 'r') as f:
                leaderboard_data = json.load(f)
                leaderboard = leaderboard_data.get('entries', [])
                stored_hash = leaderboard_data.get('hash', '')
                
                # Verify the hash
                computed_hash = generate_leaderboard_hash(leaderboard)
                if stored_hash != computed_hash:
                    print("Leaderboard data has been tampered with!")
                    return []  # Return empty leaderboard or handle as desired
                return leaderboard
        except json.JSONDecodeError:
            print("Leaderboard file is empty or corrupted. Initializing new leaderboard.")
            return []
    return []

# Function to display the leaderboard with a Back button
def show_leaderboard():
    back_button = Button(
        rect=(SCREEN_WIDTH // 2 - 75, SCREEN_HEIGHT - 100, 150, 50),
        color=BUTTON_COLOR,
        text="Back"
    )
    while True:
        screen.fill(WHITE)
        # Render leaderboard title
        leaderboard_title = font.render("Leaderboard", True, BLACK)
        screen.blit(leaderboard_title, (SCREEN_WIDTH // 2 - leaderboard_title.get_width() // 2, 50))

        # Load leaderboard data
        leaderboard = load_leaderboard()

        # Display leaderboard entries
        y_offset = 150
        for entry in leaderboard:
            entry_text = font.render(f"{entry['name']} - Score: {entry['score']} - Level: {entry['level']} - {entry['date']}", True, BLACK)
            screen.blit(entry_text, (SCREEN_WIDTH // 2 - entry_text.get_width() // 2, y_offset))
            y_offset += 50

        # Draw Back button
        mouse_pos = pygame.mouse.get_pos()
        back_button.hovered = back_button.is_hovered(mouse_pos)
        back_button.draw(screen)

        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if back_button.is_clicked(mouse_pos):
                    return  # Return to the previous screen

# Function to display Game Over screen and get player's name
def show_game_over_screen(final_score):
    player_name = get_player_name()
    update_leaderboard(player_name, final_score, current_level)
    screen.fill(WHITE)
    # Render texts
    game_over_text = game_over_font.render("GAME OVER", True, RED)
    score_text = font.render(f"Your Final Score: {final_score}", True, BLACK)
    level_text = font.render(f"You Reached Level: {current_level}", True, NEON_GREEN)
    created_by_text = credit_font.render("Created by SSgt King", True, DARK_GREY)
    fun_message_text = font.render("Have fun with the AFJIS report!", True, BLACK)

    # Position texts
    screen.blit(game_over_text, (SCREEN_WIDTH // 2 - game_over_text.get_width() // 2, SCREEN_HEIGHT // 2 - 200))
    screen.blit(score_text, (SCREEN_WIDTH // 2 - score_text.get_width() // 2, SCREEN_HEIGHT // 2 - 100))
    screen.blit(level_text, (SCREEN_WIDTH // 2 - level_text.get_width() // 2, SCREEN_HEIGHT // 2 - 50))
    screen.blit(created_by_text, (SCREEN_WIDTH // 2 - created_by_text.get_width() // 2, SCREEN_HEIGHT // 2))
    screen.blit(fun_message_text, (SCREEN_WIDTH // 2 - fun_message_text.get_width() // 2, SCREEN_HEIGHT // 2 + 50))

    pygame.display.flip()
    pygame.time.delay(3000)  # Display the screen for 3 seconds before showing the leaderboard
    show_leaderboard()

# Function to display game information (score, health, level)
def display_game_info():
    # Render score, health, and level
    score_text = font.render(f"Score: {int(score * score_multiplier)}", True, TEXT_PRIMARY)
    health_text = font.render(f"Health: {visitor_health}", True, CAUTION_YELLOW)
    level_text = font.render(f"Level: {current_level}", True, NEON_GREEN)

    # Blit the texts to the screen
    screen.blit(score_text, (10, 10))
    screen.blit(health_text, (10, 60))
    screen.blit(level_text, (10, 110))

    # Draw separators
    separator_color = METALLIC_SILVER
    separator_thickness = 2
    pygame.draw.line(screen, separator_color, (10, 150), (SCREEN_WIDTH - 10, 150), separator_thickness)

# Main game loop
def main_game():
    global visitor_x, visitor_y, visitor_health, score, bollard_speed, current_level, score_multiplier
    running = True
    clock = pygame.time.Clock()

    while running:
        screen.fill(PRIMARY_BACKGROUND)  # Updated background color

        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()

        # Get key presses for movement
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] and visitor_x > 0:
            visitor_x -= visitor_speed
        if keys[pygame.K_RIGHT] and visitor_x < SCREEN_WIDTH - 100:
            visitor_x += visitor_speed

        # Update bollard positions
        for bollard in bollard_list:
            bollard[1] += bollard_speed
            # If a bollard goes off-screen, reset it
            if bollard[1] > SCREEN_HEIGHT:
                bollard[1] = random.randint(-150, -50)
                bollard[0] = random.randint(0, SCREEN_WIDTH - bollard_width)
                score += 1 * score_multiplier  # Increase score with multiplier
                increase_difficulty()         # Adjust difficulty based on new score

        # Draw visitor and bollards
        draw_visitor(visitor_x, visitor_y)
        draw_bollards(bollard_list)

        # Check for collisions
        if check_collision(bollard_list, visitor_x, visitor_y):
            visitor_health -= 1
            # Reset bollard positions after collision
            for bollard in bollard_list:
                bollard[1] = random.randint(-150, -50)
                bollard[0] = random.randint(0, SCREEN_WIDTH - bollard_width)
            if visitor_health <= 0:
                show_game_over_screen(int(score * score_multiplier))
                running = False

        # Display game info (score, health, level)
        display_game_info()

        pygame.display.flip()
        clock.tick(60)

# Function to display the landing page with enhanced styling
def show_landing_page():
    global running, sound_enabled
    # Define buttons with updated positions and sizes for better spacing
    start_button = Button(
        rect=(SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2 - 100, 300, 80),
        color=BUTTON_COLOR,
        text="Start"
    )
    leaderboard_button = Button(
        rect=(SCREEN_WIDTH // 2 - 200, SCREEN_HEIGHT // 2, 400, 80),
        color=BUTTON_COLOR,
        text="View Leaderboard"
    )
    toggle_sound_button = Button(
        rect=(SCREEN_WIDTH // 2 - 125, SCREEN_HEIGHT // 2 + 100, 250, 80),
        color=BUTTON_COLOR,
        text="Sound: Off"
    )

    waiting = True
    while waiting:
        screen.fill(PRIMARY_BACKGROUND)

        # Render texts
        title_text = title_font.render("You Are Approaching WPAFB Gate", True, TEXT_PRIMARY)
        subtitle_text = subtitle_font.render("Good Luck!", True, TEXT_PRIMARY)
        created_by_text = credit_font.render("Created by SSgt King", True, TEXT_PRIMARY)
        repo_text = credit_font.render("Click here to see the project -> github.com/lordbuffcloud/bollard_striker", True, BOLT_BLUE)

        # Calculate GitHub link box size based on text width
        repo_text_width = repo_text.get_width()
        repo_rect = pygame.Rect(
            SCREEN_WIDTH // 2 - (repo_text_width + 20) // 2,  # Center horizontally with padding
            SCREEN_HEIGHT - 70,                                # Vertical position
            repo_text_width + 20,                             # Width with padding
            25                                                # Height
        )

        # Position texts - Moved everything up
        screen.blit(title_text, (SCREEN_WIDTH // 2 - title_text.get_width() // 2, 50))
        screen.blit(subtitle_text, (SCREEN_WIDTH // 2 - subtitle_text.get_width() // 2, 120))

        # Update toggle sound button label based on sound state
        toggle_sound_button.text = "Sound: On" if sound_enabled else "Sound: Off"

        # Draw buttons
        mouse_pos = pygame.mouse.get_pos()
        start_button.hovered = start_button.is_hovered(mouse_pos)
        leaderboard_button.hovered = leaderboard_button.is_hovered(mouse_pos)
        toggle_sound_button.hovered = toggle_sound_button.is_hovered(mouse_pos)
        start_button.draw(screen)
        leaderboard_button.draw(screen)
        toggle_sound_button.draw(screen)

        # Draw credits and GitHub link - Adjusted positioning
        screen.blit(created_by_text, (SCREEN_WIDTH // 2 - created_by_text.get_width() // 2, SCREEN_HEIGHT - 100))
        screen.blit(repo_text, (repo_rect.x + 10, repo_rect.y))  # Add padding to text position
        pygame.draw.rect(screen, METALLIC_SILVER, repo_rect, 1)  # Draw box around link

        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if start_button.is_clicked(mouse_pos):
                    if sound_enabled:
                        pygame.mixer.music.play(-1)
                    waiting = False
                elif leaderboard_button.is_clicked(mouse_pos):
                    show_leaderboard()
                elif toggle_sound_button.is_clicked(mouse_pos):
                    sound_enabled = not sound_enabled
                    toggle_sound_button.text = "Sound: On" if sound_enabled else "Sound: Off"
                    if sound_enabled:
                        pygame.mixer.music.play(-1)
                    else:
                        pygame.mixer.music.pause()
                # Detecting click on the GitHub link
                if repo_rect.collidepoint(mouse_pos):
                    webbrowser.open("https://github.com/lordbuffcloud/bollard_striker")

# Start the game by showing the landing page
show_landing_page()
main_game()

# Quit the game
pygame.quit()
